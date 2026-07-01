// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

// =============================================================================
//  LunexLP — ERC-20 LP Token (inlined, no local import needed)
// =============================================================================

contract LunexLP is ERC20, AccessControl {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC20("Lunex USDC/EURC LP Token", "lunex-UE-LP") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function decimals() public pure override returns (uint8) { return 18; }

    function setMinter(address pool) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(pool != address(0), "LunexLP: zero address");
        _grantRole(MINTER_ROLE, pool);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }
}

// =============================================================================
//  LunexSwapPool — Curve-style StableSwap AMM for USDC / EURC
// =============================================================================
//
//  Arc Testnet token addresses:
//    USDC: 0x3600000000000000000000000000000000000000  (6 decimals)
//    EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a  (6 decimals)
//
//  Deployment:
//    1. Paste this file into Remix and compile
//    2. Deploy LunexSwapPool with constructor args (see guide)
//    3. The constructor auto-deploys LunexLP and wires it up
//    4. Call lpToken() after deploy to get the LP token address
//
//  StableSwap invariant:
//    A * n^n * sum(x) + D = A * n^n * D + D^(n+1) / (n^n * prod(x))
//    n=2, solved via Newton's method
// =============================================================================

contract LunexSwapPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────────────────
    uint256 public constant N               = 2;
    uint256 public constant FEE_DENOM       = 1e10;
    uint256 public constant A_PREC          = 100;
    uint256 public constant MAX_FEE         = 5e8;        // 5%
    uint256 public constant ADMIN_FEE_RATIO = 5e9;        // 50% of swap fee
    uint256 public constant MAX_A           = 1_000_000;

    // ── Immutables ────────────────────────────────────────────────────────
    IERC20  public immutable coin0;       // USDC  (index 0)
    IERC20  public immutable coin1;       // EURC  (index 1)
    LunexLP public immutable lpToken;    // auto-deployed in constructor
    uint256 public immutable precMul0;   // 1e12  (normalise 6-dec to 1e18)
    uint256 public immutable precMul1;   // 1e12

    // ── State ─────────────────────────────────────────────────────────────
    uint256 public A;
    uint256 public fee;
    uint256 public adminBal0;
    uint256 public adminBal1;
    uint256 internal reserve0;
    uint256 internal reserve1;
    address public feeReceiver;

    // ── Events ────────────────────────────────────────────────────────────
    event TokenExchange(
        address indexed buyer,
        uint256 sold_id,
        uint256 tokens_sold,
        uint256 bought_id,
        uint256 tokens_bought
    );
    event AddLiquidity(
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 lp_minted,
        uint256 invariant
    );
    event RemoveLiquidity(
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 lp_burned
    );
    event RemoveLiquidityOneCoin(
        address indexed provider,
        uint256 token_index,
        uint256 lp_burned,
        uint256 coin_amount
    );
    event AdminFeesWithdrawn(uint256 amount0, uint256 amount1, address recipient);

    // ── Constructor ───────────────────────────────────────────────────────
    //
    //  _coins:  [USDC_ADDRESS, EURC_ADDRESS]
    //  _A:      200   (amplification — pass as plain number, e.g. 200)
    //  _fee:    4000000  (0.04% swap fee)
    //  _admin:  your wallet address (receives admin fees)
    //
    constructor(
        address[2] memory _coins,
        uint256 _A,
        uint256 _fee,
        address _admin
    ) Ownable(msg.sender) {
        require(_coins[0] != address(0) && _coins[1] != address(0), "Pool: zero addr");
        require(_coins[0] != _coins[1],  "Pool: same token");
        require(_A > 0 && _A <= MAX_A,   "Pool: bad A");
        require(_fee <= MAX_FEE,         "Pool: fee too high");
        require(_admin != address(0),    "Pool: zero admin");

        coin0       = IERC20(_coins[0]);
        coin1       = IERC20(_coins[1]);
        A           = _A * A_PREC;
        fee         = _fee;
        feeReceiver = _admin;
        precMul0    = 1e12;
        precMul1    = 1e12;

        // Deploy LP token and grant this pool minting rights
        LunexLP lp = new LunexLP();
        lp.setMinter(address(this));
        lpToken = lp;
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    function _coin(uint256 i) internal view returns (IERC20) {
        return i == 0 ? coin0 : coin1;
    }

    function _pm(uint256 i) internal view returns (uint256) {
        return i == 0 ? precMul0 : precMul1;
    }

    function _res(uint256 i) internal view returns (uint256) {
        return i == 0 ? reserve0 : reserve1;
    }

    function _setRes(uint256 i, uint256 v) internal {
        if (i == 0) reserve0 = v; else reserve1 = v;
    }

    function _xp() internal view returns (uint256[2] memory xp) {
        xp[0] = reserve0 * precMul0;
        xp[1] = reserve1 * precMul1;
    }

    function _xpFrom(uint256 r0, uint256 r1) internal view returns (uint256[2] memory xp) {
        xp[0] = r0 * precMul0;
        xp[1] = r1 * precMul1;
    }

    function _getD(uint256[2] memory xp) internal view returns (uint256 D) {
        uint256 S = xp[0] + xp[1];
        if (S == 0) return 0;
        D = S;
        uint256 Ann = A * N;
        for (uint256 i; i < 255; ++i) {
            uint256 Dp    = D * D / (xp[0] * N + 1);
            Dp            = Dp * D / (xp[1] * N + 1);
            uint256 Dprev = D;
            D = (Ann * S / A_PREC + Dp * N) * D
                / ((Ann / A_PREC - 1) * D + (N + 1) * Dp);
            if (D > Dprev && D - Dprev <= 1) break;
            if (D <= Dprev && Dprev - D <= 1) break;
        }
    }

    function _getY(uint256 D, uint256 j, uint256[2] memory xp)
        internal view returns (uint256 y)
    {
        uint256 Ann = A * N;
        uint256 c   = D * D / (xp[j == 0 ? 1 : 0] * N);
        c = c * D * A_PREC / (Ann * N);
        uint256 b = xp[j == 0 ? 1 : 0] + D * A_PREC / Ann;
        y = D;
        for (uint256 i; i < 255; ++i) {
            uint256 yp = y;
            y = (y * y + c) / (2 * y + b - D);
            if (y > yp && y - yp <= 1) break;
            if (y <= yp && yp - y <= 1) break;
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────

    function balances(uint256 i) external view returns (uint256) {
        require(i < N, "Pool: bad index");
        return _res(i);
    }

    function get_balances() external view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    function coins(uint256 i) external view returns (address) {
        require(i < N, "Pool: bad index");
        return i == 0 ? address(coin0) : address(coin1);
    }

    function get_dy(uint256 i, uint256 j, uint256 dx)
        external view returns (uint256 dy)
    {
        require(i != j && i < N && j < N, "Pool: bad index");
        require(reserve0 > 0 && reserve1 > 0, "Pool: no liquidity");
        uint256[2] memory xp = _xp();
        uint256 D   = _getD(xp);
        xp[i]      += dx * _pm(i);
        uint256 y   = _getY(D, j, xp);
        uint256 raw = (xp[j] - y - 1) / _pm(j);
        dy = raw - raw * fee / FEE_DENOM;
    }

    function calc_token_amount(uint256[2] calldata amounts, bool isDeposit)
        external view returns (uint256 lpAmount)
    {
        uint256 ts = lpToken.totalSupply();
        uint256 D0 = ts > 0 ? _getD(_xp()) : 0;
        uint256 r0 = isDeposit ? reserve0 + amounts[0] : reserve0 - amounts[0];
        uint256 r1 = isDeposit ? reserve1 + amounts[1] : reserve1 - amounts[1];
        uint256 D1 = _getD(_xpFrom(r0, r1));
        if (ts == 0) return D1;
        lpAmount = isDeposit ? ts * (D1 - D0) / D0 : ts * (D0 - D1) / D0;
    }

    // ── Swap ──────────────────────────────────────────────────────────────

    function exchange(uint256 i, uint256 j, uint256 dx, uint256 minDy)
        external nonReentrant returns (uint256 dy)
    {
        require(i != j && i < N && j < N, "Pool: bad index");
        require(dx > 0, "Pool: zero in");
        require(reserve0 > 0 && reserve1 > 0, "Pool: no liquidity");

        _coin(i).safeTransferFrom(msg.sender, address(this), dx);

        uint256[2] memory xp = _xp();
        uint256 D    = _getD(xp);
        xp[i]       += dx * _pm(i);
        uint256 y    = _getY(D, j, xp);
        uint256 raw  = (xp[j] - y - 1) / _pm(j);
        uint256 swapFee  = raw * fee / FEE_DENOM;
        uint256 adminCut = swapFee * ADMIN_FEE_RATIO / FEE_DENOM;
        dy = raw - swapFee;

        require(dy >= minDy, "Pool: slippage");
        require(dy <= _res(j), "Pool: insufficient reserve");

        _setRes(i, _res(i) + dx);
        _setRes(j, _res(j) - dy - adminCut);
        if (j == 0) adminBal0 += adminCut;
        else        adminBal1 += adminCut;

        _coin(j).safeTransfer(msg.sender, dy);
        emit TokenExchange(msg.sender, i, dx, j, dy);
    }

    // ── Liquidity ─────────────────────────────────────────────────────────

    function add_liquidity(uint256[2] calldata amounts, uint256 minMintAmount)
        external nonReentrant returns (uint256 lpMinted)
    {
        require(amounts[0] > 0 || amounts[1] > 0, "Pool: zero amounts");

        uint256 ts = lpToken.totalSupply();
        uint256 D0 = ts > 0 ? _getD(_xp()) : 0;

        if (amounts[0] > 0) {
            coin0.safeTransferFrom(msg.sender, address(this), amounts[0]);
            reserve0 += amounts[0];
        }
        if (amounts[1] > 0) {
            coin1.safeTransferFrom(msg.sender, address(this), amounts[1]);
            reserve1 += amounts[1];
        }

        uint256 D1 = _getD(_xp());
        require(D1 > D0, "Pool: D not increased");

        lpMinted = ts == 0 ? D1 : ts * (D1 - D0) / D0;
        require(lpMinted >= minMintAmount, "Pool: slippage on LP");

        lpToken.mint(msg.sender, lpMinted);
        emit AddLiquidity(msg.sender, amounts[0], amounts[1], lpMinted, D1);
    }

    function remove_liquidity(uint256 amount, uint256[2] calldata minAmounts)
        external nonReentrant returns (uint256 out0, uint256 out1)
    {
        require(amount > 0, "Pool: zero LP");
        uint256 ts = lpToken.totalSupply();
        out0 = reserve0 * amount / ts;
        out1 = reserve1 * amount / ts;
        require(out0 >= minAmounts[0] && out1 >= minAmounts[1], "Pool: slippage");
        reserve0 -= out0;
        reserve1 -= out1;
        lpToken.burnFrom(msg.sender, amount);
        coin0.safeTransfer(msg.sender, out0);
        coin1.safeTransfer(msg.sender, out1);
        emit RemoveLiquidity(msg.sender, out0, out1, amount);
    }

    function remove_liquidity_one_coin(uint256 amount, uint256 i, uint256 minAmount)
        external nonReentrant returns (uint256 coinOut)
    {
        require(amount > 0, "Pool: zero LP");
        require(i < N, "Pool: bad index");
        uint256 ts  = lpToken.totalSupply();
        uint256[2] memory xp = _xp();
        uint256 D   = _getD(xp);
        uint256 D1  = D * (ts - amount) / ts;
        uint256 y   = _getY(D1, i, xp);
        uint256 raw = (xp[i] - y - 1) / _pm(i);
        uint256 swapFee  = raw * fee / FEE_DENOM;
        uint256 adminCut = swapFee * ADMIN_FEE_RATIO / FEE_DENOM;
        coinOut = raw - swapFee;
        require(coinOut >= minAmount, "Pool: slippage");
        _setRes(i, _res(i) - coinOut - adminCut);
        if (i == 0) adminBal0 += adminCut; else adminBal1 += adminCut;
        lpToken.burnFrom(msg.sender, amount);
        _coin(i).safeTransfer(msg.sender, coinOut);
        emit RemoveLiquidityOneCoin(msg.sender, i, amount, coinOut);
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    function withdraw_admin_fees() external onlyOwner {
        uint256 a0 = adminBal0;
        uint256 a1 = adminBal1;
        if (a0 > 0) { adminBal0 = 0; coin0.safeTransfer(feeReceiver, a0); }
        if (a1 > 0) { adminBal1 = 0; coin1.safeTransfer(feeReceiver, a1); }
        emit AdminFeesWithdrawn(a0, a1, feeReceiver);
    }

    function set_fee_receiver(address v) external onlyOwner {
        require(v != address(0)); feeReceiver = v;
    }

    function set_A(uint256 v) external onlyOwner {
        require(v > 0 && v <= MAX_A); A = v * A_PREC;
    }

    function set_fee(uint256 v) external onlyOwner {
        require(v <= MAX_FEE); fee = v;
    }
}
