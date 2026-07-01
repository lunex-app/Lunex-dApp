// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./LunexLPToken.sol";

/// @title LunexStableSwap - Generic Curve-style 2-coin StableSwap AMM
/// @notice Supports any two 6-decimal ERC-20 tokens with minimal slippage.
///         Emits events compatible with the existing Lunex analytics indexer.
contract LunexStableSwap {
    // ── Constants ──────────────────────────────────────────────────────────────
    uint256 private constant N               = 2;
    uint256 private constant A_PRECISION     = 100;
    uint256 private constant FEE_DENOMINATOR = 1e10;
    uint256 private constant MAX_FEE         = 5e8;       // 5%
    uint256 private constant MAX_ADMIN_FEE   = 5e9;       // 50%
    uint256 private constant MAX_ITER        = 255;

    // ── Storage ────────────────────────────────────────────────────────────────
    address[2] public coins;
    uint256[2] public balances;
    uint256 public fee;
    uint256 public adminFee;
    address public admin;
    LunexLPToken public lpToken;

    uint256 private _ampA;   // A * A_PRECISION

    // ── Events ────────────────────────────────────────────────────────────────
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
        uint256 invariant,
        uint256 token_supply
    );
    event RemoveLiquidity(
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 token_supply
    );
    event RemoveLiquidityOne(
        address indexed provider,
        uint256 token_amount,
        uint256 coin_amount,
        uint256 token_supply
    );

    // ── Constructor ────────────────────────────────────────────────────────────
    constructor(
        address coin0,
        address coin1,
        uint256 amp,
        uint256 fee_,
        uint256 adminFee_,
        string memory lpName,
        string memory lpSymbol
    ) {
        require(fee_ <= MAX_FEE, "fee>max");
        require(adminFee_ <= MAX_ADMIN_FEE, "adminFee>max");
        coins[0] = coin0;
        coins[1] = coin1;
        fee = fee_;
        adminFee = adminFee_;
        admin = msg.sender;
        _ampA = amp * A_PRECISION;
        lpToken = new LunexLPToken(lpName, lpSymbol, address(this));
    }

    function A() external view returns (uint256) { return _ampA / A_PRECISION; }

    // ── StableSwap invariant D ────────────────────────────────────────────────
    // For 2 coins: 4A(x+y) + D = 4AD + D^3/(4xy)
    // Newton: D = (4A*S + 2*D_P) * D / ((4A-1)*D + 3*D_P)
    // where D_P = D^3/(4*x*y)
    function _getD(uint256 x, uint256 y) internal view returns (uint256 D) {
        uint256 S = x + y;
        if (S == 0) return 0;
        uint256 Ann = 4 * (_ampA / A_PRECISION);
        D = S;
        for (uint256 k = 0; k < MAX_ITER; k++) {
            uint256 DP = D * D / x * D / (4 * y);
            uint256 Dprev = D;
            D = (Ann * S + 2 * DP) * D / ((Ann - 1) * D + 3 * DP);
            if (_absDiff(D, Dprev) <= 1) break;
        }
    }

    // Find y given D and new x (Newton on quadratic)
    // Solves: y^2 + (x + D/(4A) - D)*y = D^3/(16A*x)
    function _getY(uint256 x, uint256 D) internal view returns (uint256 y) {
        uint256 Ann = 4 * (_ampA / A_PRECISION);
        uint256 c = D * D / (4 * x) * D / Ann / 4;
        uint256 b = x + D / Ann;
        y = D;
        for (uint256 k = 0; k < MAX_ITER; k++) {
            uint256 yPrev = y;
            y = (y * y + c) / (2 * y + b - D);
            if (_absDiff(y, yPrev) <= 1) break;
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function get_dy(uint256 i, uint256 j, uint256 dx) external view returns (uint256) {
        require(i != j && i < 2 && j < 2, "bad idx");
        uint256 D = _getD(balances[0], balances[1]);
        uint256 xNew = balances[i] + dx;
        uint256 yNew = _getY(xNew, D);
        uint256 dy = balances[j] - yNew - 1;
        return dy - dy * fee / FEE_DENOMINATOR;
    }

    function get_balances() external view returns (uint256[2] memory) { return balances; }

    function calc_token_amount(uint256[2] calldata amounts, bool deposit) external view returns (uint256) {
        uint256 D0 = _getD(balances[0], balances[1]);
        uint256 b0 = deposit ? balances[0] + amounts[0] : balances[0] - amounts[0];
        uint256 b1 = deposit ? balances[1] + amounts[1] : balances[1] - amounts[1];
        uint256 D1 = _getD(b0, b1);
        uint256 supply = lpToken.totalSupply();
        if (supply == 0) return D1;
        return supply * (deposit ? D1 - D0 : D0 - D1) / D0;
    }

    function calc_withdraw_one_coin(uint256 lpAmount, uint256 i) external view returns (uint256) {
        return _calcWithdrawOneCoin(lpAmount, i);
    }

    function _calcWithdrawOneCoin(uint256 lpAmount, uint256 i) internal view returns (uint256) {
        uint256 supply = lpToken.totalSupply();
        uint256 D = _getD(balances[0], balances[1]);
        uint256 D1 = D - D * lpAmount / supply;
        // proportional share of coin i after D reduction
        uint256 dy = balances[i] - balances[i] * D1 / D;
        return dy - dy * fee * N / (4 * FEE_DENOMINATOR);
    }

    // ── Exchange ──────────────────────────────────────────────────────────────

    function exchange(uint256 i, uint256 j, uint256 dx, uint256 minDy) external returns (uint256 dy) {
        require(i != j && i < 2 && j < 2, "bad idx");
        _safeTransferFrom(coins[i], msg.sender, address(this), dx);

        uint256 D = _getD(balances[0], balances[1]);
        uint256 xNew = balances[i] + dx;
        uint256 yNew = _getY(xNew, D);
        dy = balances[j] - yNew - 1;

        uint256 dyFee = dy * fee / FEE_DENOMINATOR;
        dy -= dyFee;
        require(dy >= minDy, "slippage");

        balances[i] = xNew;
        balances[j] = yNew + (dyFee - dyFee * adminFee / FEE_DENOMINATOR);

        _safeTransfer(coins[j], msg.sender, dy);
        emit TokenExchange(msg.sender, i, dx, j, dy);
    }

    // ── Liquidity ─────────────────────────────────────────────────────────────

    function add_liquidity(uint256[2] calldata amounts, uint256 minMint) external returns (uint256 mint) {
        uint256 supply = lpToken.totalSupply();
        uint256 D0 = supply > 0 ? _getD(balances[0], balances[1]) : 0;

        uint256[2] memory nb;
        for (uint256 k = 0; k < 2; k++) {
            if (amounts[k] > 0) {
                _safeTransferFrom(coins[k], msg.sender, address(this), amounts[k]);
            } else {
                require(supply > 0, "zero initial");
            }
            nb[k] = balances[k] + amounts[k];
        }

        uint256 D1 = _getD(nb[0], nb[1]);
        require(D1 > D0 || supply == 0, "D decreased");

        if (supply == 0) {
            mint = D1;
            balances[0] = nb[0];
            balances[1] = nb[1];
        } else {
            // Imbalance fee
            for (uint256 k = 0; k < 2; k++) {
                uint256 ideal = D1 * balances[k] / D0;
                uint256 diff = _absDiff(nb[k], ideal);
                uint256 feeAmt = fee * 2 * diff / (4 * FEE_DENOMINATOR);
                balances[k] = nb[k] - feeAmt * adminFee / FEE_DENOMINATOR;
                nb[k] -= feeAmt;
            }
            uint256 D2 = _getD(nb[0], nb[1]);
            mint = supply * (D2 - D0) / D0;
        }

        require(mint >= minMint, "slippage");
        lpToken.mint(msg.sender, mint);
        emit AddLiquidity(msg.sender, amounts[0], amounts[1], D1, lpToken.totalSupply());
    }

    function remove_liquidity(uint256 lpAmount, uint256[2] calldata minAmounts)
        external returns (uint256[2] memory amounts)
    {
        uint256 supply = lpToken.totalSupply();
        for (uint256 k = 0; k < 2; k++) {
            amounts[k] = balances[k] * lpAmount / supply;
            require(amounts[k] >= minAmounts[k], "slippage");
            balances[k] -= amounts[k];
            _safeTransfer(coins[k], msg.sender, amounts[k]);
        }
        lpToken.burn(msg.sender, lpAmount);
        emit RemoveLiquidity(msg.sender, amounts[0], amounts[1], lpToken.totalSupply());
    }

    function remove_liquidity_one_coin(uint256 lpAmount, uint256 i, uint256 minAmount)
        external returns (uint256 dy)
    {
        require(i < 2, "bad idx");
        dy = _calcWithdrawOneCoin(lpAmount, i);
        require(dy >= minAmount, "slippage");
        balances[i] -= dy;
        lpToken.burn(msg.sender, lpAmount);
        _safeTransfer(coins[i], msg.sender, dy);
        emit RemoveLiquidityOne(msg.sender, lpAmount, dy, lpToken.totalSupply());
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function withdrawAdminFees() external {
        require(msg.sender == admin, "not admin");
        for (uint256 k = 0; k < 2; k++) {
            (bool ok, bytes memory data) = coins[k].staticcall(
                abi.encodeWithSignature("balanceOf(address)", address(this))
            );
            require(ok, "balanceOf failed");
            uint256 onchain = abi.decode(data, (uint256));
            if (onchain > balances[k]) _safeTransfer(coins[k], admin, onchain - balances[k]);
        }
    }

    function setAdmin(address newAdmin) external { require(msg.sender == admin); admin = newAdmin; }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _absDiff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transferFrom failed");
    }
}
