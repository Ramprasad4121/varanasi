// Author: Ramprasad — self-contained ERC20 for the zero-dep rail (OZ v5 shape, 18-decimal default).
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "./IERC20.sol";

contract ERC20 is IERC20 {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;
    string private _name;
    string private _symbol;

    error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);
    error ERC20InvalidSender(address sender);
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);
    error ERC20InvalidApprover(address approver);
    error ERC20InvalidSpender(address spender);

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view virtual returns (uint8) {
        return 18;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 value) public virtual override returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function allowance(address owner_, address spender) public view virtual override returns (uint256) {
        return _allowances[owner_][spender];
    }

    function approve(address spender, uint256 value) public virtual override returns (bool) {
        if (spender == address(0)) revert ERC20InvalidSpender(address(0));
        _approve(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public virtual override returns (bool) {
        uint256 current = _allowances[from][msg.sender];
        if (current != type(uint256).max) {
            if (current < value) revert ERC20InsufficientAllowance(msg.sender, current, value);
            unchecked {
                _approve(from, msg.sender, current - value);
            }
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (from == address(0)) revert ERC20InvalidSender(address(0));
        uint256 balance = _balances[from];
        if (balance < value) revert ERC20InsufficientBalance(from, balance, value);
        unchecked {
            _balances[from] = balance - value;
            _balances[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        _totalSupply += value;
        unchecked {
            _balances[to] += value;
        }
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        uint256 balance = _balances[from];
        if (balance < value) revert ERC20InsufficientBalance(from, balance, value);
        unchecked {
            _balances[from] = balance - value;
            _totalSupply -= value;
        }
        emit Transfer(from, address(0), value);
    }

    function _approve(address owner_, address spender, uint256 value) internal {
        if (owner_ == address(0)) revert ERC20InvalidApprover(address(0));
        _allowances[owner_][spender] = value;
        emit Approval(owner_, spender, value);
    }
}
