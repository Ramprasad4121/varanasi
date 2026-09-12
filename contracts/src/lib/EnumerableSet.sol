// Author: Ramprasad — minimal EnumerableSet (AddressSet only) for the zero-dep rail.
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library EnumerableSet {
    struct AddressSet {
        address[] _values;
        mapping(address => uint256) _indexes;
    }

    function add(AddressSet storage set, address value) internal returns (bool) {
        if (!contains(set, value)) {
            set._values.push(value);
            set._indexes[value] = set._values.length;
            return true;
        }
        return false;
    }

    function remove(AddressSet storage set, address value) internal returns (bool) {
        uint256 pos = set._indexes[value];
        if (pos != 0) {
            uint256 len = set._values.length;
            uint256 lastIdx = len - 1;
            if (pos - 1 != lastIdx) {
                address moved = set._values[lastIdx];
                set._values[pos - 1] = moved;
                set._indexes[moved] = pos;
            }
            set._values.pop();
            delete set._indexes[value];
            return true;
        }
        return false;
    }

    function contains(AddressSet storage set, address value) internal view returns (bool) {
        return set._indexes[value] != 0;
    }

    function length(AddressSet storage set) internal view returns (uint256) {
        return set._values.length;
    }

    function at(AddressSet storage set, uint256 index) internal view returns (address) {
        return set._values[index];
    }
}
