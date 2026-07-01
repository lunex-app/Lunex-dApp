// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";

interface IPool {
    function remove_liquidity_one_coin(uint256 amount, uint256 i, uint256 minAmount) external returns (uint256);
    function add_liquidity(uint256[2] calldata amounts, uint256 minMintAmount) external returns (uint256);
}

interface IVault {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

/**
 * @notice Autonomous rebalancer proxy for Lunex AI.
 *
 * Users do THREE one-time setup calls when enabling autonomous mode:
 *   1. LP_TOKEN.approve(AgentExecutor, MAX_UINT256)
 *   2. VAULT_USDC.approve(AgentExecutor, MAX_UINT256)
 *   3. AgentExecutor.setOperator(AGENT_WALLET, true)
 *
 * After that the Lunex AI agent hot wallet calls rebalanceToVault() or
 * rebalanceToPool() with no wallet popup needed on the user's side.
 * Users can revoke at any time: setOperator(AGENT_WALLET, false).
 */
contract AgentExecutor {
    // operators[user][agent] = authorized
    mapping(address => mapping(address => bool)) public operators;

    address public immutable LP_TOKEN;
    address public immutable SWAP_POOL;
    address public immutable VAULT_USDC;
    address public immutable USDC;

    event OperatorSet(address indexed user, address indexed op, bool allowed);
    event RebalancedToVault(address indexed user, uint256 lpIn, uint256 usdcDeposited);
    event RebalancedToPool(address indexed user, uint256 sharesIn, uint256 lpOut);

    constructor(address lpToken, address swapPool, address vaultUsdc, address usdc) {
        LP_TOKEN   = lpToken;
        SWAP_POOL  = swapPool;
        VAULT_USDC = vaultUsdc;
        USDC       = usdc;
    }

    modifier onlyOperatorOf(address user) {
        require(operators[user][msg.sender], "AgentExecutor: not authorized");
        _;
    }

    /// @notice Grant or revoke the agent wallet's permission to act on your behalf.
    function setOperator(address op, bool allowed) external {
        operators[msg.sender][op] = allowed;
        emit OperatorSet(msg.sender, op, allowed);
    }

    /**
     * @notice Pull user's LP → remove as USDC → deposit to vault.
     *         Vault shares land directly in `user`'s wallet.
     *         Requires: user approved LP_TOKEN to this contract.
     */
    function rebalanceToVault(address user) external onlyOperatorOf(user) {
        uint256 lp = IERC20(LP_TOKEN).balanceOf(user);
        require(lp > 0, "AgentExecutor: no LP tokens");

        // Pull LP from user into this contract
        IERC20(LP_TOKEN).transferFrom(user, address(this), lp);

        // Remove LP as single-sided USDC (coin index 0)
        IERC20(LP_TOKEN).approve(SWAP_POOL, lp);
        uint256 usdc = IPool(SWAP_POOL).remove_liquidity_one_coin(lp, 0, 0);

        // Deposit USDC to vault; shares go directly to user
        IERC20(USDC).approve(VAULT_USDC, usdc);
        IVault(VAULT_USDC).deposit(usdc, user);

        emit RebalancedToVault(user, lp, usdc);
    }

    /**
     * @notice Pull user's vault shares → redeem for USDC → add as pool LP.
     *         LP tokens land directly in `user`'s wallet.
     *         Requires: user approved VAULT_USDC shares to this contract.
     */
    function rebalanceToPool(address user) external onlyOperatorOf(user) {
        uint256 shares = IERC20(VAULT_USDC).balanceOf(user);
        require(shares > 0, "AgentExecutor: no vault shares");

        // Pull vault shares into this contract, then redeem (owner == address(this), no extra allowance)
        IERC20(VAULT_USDC).transferFrom(user, address(this), shares);
        uint256 usdc = IVault(VAULT_USDC).redeem(shares, address(this), address(this));

        // Add USDC as single-sided liquidity; LP minted goes to this contract then forwarded
        IERC20(USDC).approve(SWAP_POOL, usdc);
        uint256[2] memory amounts = [usdc, uint256(0)];
        uint256 lp = IPool(SWAP_POOL).add_liquidity(amounts, 0);

        // Forward LP to user
        IERC20(LP_TOKEN).transfer(user, lp);

        emit RebalancedToPool(user, shares, lp);
    }
}
