// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LunexUSDT - Testnet mintable USDT for Lunex Finance on Arc
/// @notice Mirrors real USDT: 6 decimals, dollar-pegged, public faucet with 24h cooldown.
contract LunexUSDT {
    string public constant name     = "Tether USD";
    string public constant symbol   = "USDT";
    uint8  public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public owner;

    uint256 public constant FAUCET_AMOUNT   = 1_000 * 1e6;  // 1,000 USDT
    uint256 public constant FAUCET_COOLDOWN = 24 hours;
    mapping(address => uint256) public lastClaim;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner_, address indexed spender, uint256 value);
    event Claimed(address indexed to, uint256 amount, uint256 nextClaimAt);
    event OwnershipTransferred(address indexed prev, address indexed next);

    modifier onlyOwner() { require(msg.sender == owner, "USDT: not owner"); _; }

    constructor(address initialOwner) {
        owner = initialOwner;
        _mint(initialOwner, 10_000_000 * 1e6); // 10M USDT seed for liquidity
    }

    // ── ERC-20 ────────────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount); return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount); return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount); return true;
    }

    // ── Faucet ────────────────────────────────────────────────────────────────

    /// @notice Claim FAUCET_AMOUNT USDT once per 24 hours
    function claim() external {
        require(block.timestamp >= lastClaim[msg.sender] + FAUCET_COOLDOWN, "USDT: cooldown");
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit Claimed(msg.sender, FAUCET_AMOUNT, block.timestamp + FAUCET_COOLDOWN);
    }

    /// @notice Seconds until `user` can claim again (0 = claimable now)
    function cooldownRemaining(address user) external view returns (uint256) {
        uint256 next = lastClaim[user] + FAUCET_COOLDOWN;
        return block.timestamp >= next ? 0 : next - block.timestamp;
    }

    /// @notice Owner-only unlimited mint for seeding pools
    function ownerMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "USDT: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _spendAllowance(address from, address spender, uint256 amount) internal {
        uint256 current = allowance[from][spender];
        if (current != type(uint256).max) {
            require(current >= amount, "USDT: insufficient allowance");
            allowance[from][spender] = current - amount;
        }
    }
}
