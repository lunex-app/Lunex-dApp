// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LuneVault - Minimal ERC-4626 tokenized yield vault for Lunex Finance
/// @notice Accepts any ERC-20 as the underlying asset. Share price increases when
///         the owner transfers tokens in (simulates yield accrual on testnet).
contract LuneVault {
    // ── ERC-20 (share token) ──────────────────────────────────────────────────
    string public name;
    string public symbol;
    uint8  public constant decimals = 6; // match underlying decimals

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ── ERC-4626 ──────────────────────────────────────────────────────────────
    address public immutable asset;
    address public owner;

    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed sender, address indexed receiver, address indexed owner_, uint256 assets, uint256 shares);

    modifier onlyOwner() { require(msg.sender == owner, "Vault: not owner"); _; }

    constructor(address asset_, string memory name_, string memory symbol_, address owner_) {
        asset = asset_; name = name_; symbol = symbol_; owner = owner_;
    }

    // ── ERC-20 interface ──────────────────────────────────────────────────────

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

    // ── ERC-4626 core ─────────────────────────────────────────────────────────

    function totalAssets() public view returns (uint256) {
        return _erc20Balance(asset, address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply;
        uint256 ta = totalAssets();
        if (supply == 0 || ta == 0) return assets;
        return assets * supply / ta;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply;
        if (supply == 0) return shares;
        return shares * totalAssets() / supply;
    }

    function maxDeposit(address) external pure returns (uint256) { return type(uint256).max; }
    function maxMint(address) external pure returns (uint256) { return type(uint256).max; }
    function maxWithdraw(address owner_) external view returns (uint256) { return convertToAssets(balanceOf[owner_]); }
    function maxRedeem(address owner_) external view returns (uint256) { return balanceOf[owner_]; }

    function previewDeposit(uint256 assets) external view returns (uint256) { return convertToShares(assets); }
    function previewRedeem(uint256 shares) external view returns (uint256) { return convertToAssets(shares); }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = convertToShares(assets);
        require(shares > 0, "Vault: zero shares");
        _safeTransferFrom(asset, msg.sender, address(this), assets);
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner_) external returns (uint256 assets) {
        if (msg.sender != owner_) _spendAllowance(owner_, msg.sender, shares);
        assets = convertToAssets(shares);
        require(assets > 0, "Vault: zero assets");
        _burn(owner_, shares);
        _safeTransfer(asset, receiver, assets);
        emit Withdraw(msg.sender, receiver, owner_, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner_) external returns (uint256 shares) {
        shares = convertToShares(assets);
        if (msg.sender != owner_) _spendAllowance(owner_, msg.sender, shares);
        _burn(owner_, shares);
        _safeTransfer(asset, receiver, assets);
        emit Withdraw(msg.sender, receiver, owner_, assets, shares);
    }

    /// @notice Owner injects yield by sending underlying tokens directly to the vault.
    ///         This increases totalAssets() and thus convertToAssets() (share price).
    function injectYield(uint256 amount) external onlyOwner {
        _safeTransferFrom(asset, msg.sender, address(this), amount);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount; balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        require(balanceOf[from] >= amount, "Vault: insufficient shares");
        balanceOf[from] -= amount; totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "Vault: insufficient balance");
        balanceOf[from] -= amount; balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _spendAllowance(address from, address spender, uint256 amount) internal {
        uint256 cur = allowance[from][spender];
        if (cur != type(uint256).max) {
            require(cur >= amount, "Vault: insufficient allowance");
            allowance[from][spender] = cur - amount;
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "Vault: transfer failed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "Vault: transferFrom failed");
    }

    function _erc20Balance(address token, address account) internal view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", account));
        require(ok, "Vault: balanceOf failed");
        return abi.decode(data, (uint256));
    }
}
