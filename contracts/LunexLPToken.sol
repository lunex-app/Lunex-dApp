// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LunexLPToken - Generic LP token for Lunex StableSwap pools
contract LunexLPToken {
    string public name;
    string public symbol;
    uint8  public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public pool; // only the pool can mint/burn

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyPool() { require(msg.sender == pool, "LP: not pool"); _; }

    constructor(string memory name_, string memory symbol_, address pool_) {
        name = name_; symbol = symbol_; pool = pool_;
    }

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

    function mint(address to, uint256 amount) external onlyPool {
        totalSupply += amount; balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyPool {
        require(balanceOf[from] >= amount, "LP: insufficient");
        balanceOf[from] -= amount; totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "LP: insufficient balance");
        balanceOf[from] -= amount; balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _spendAllowance(address from, address spender, uint256 amount) internal {
        uint256 cur = allowance[from][spender];
        if (cur != type(uint256).max) {
            require(cur >= amount, "LP: insufficient allowance");
            allowance[from][spender] = cur - amount;
        }
    }
}
