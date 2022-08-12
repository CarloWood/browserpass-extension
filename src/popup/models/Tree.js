"use strict";

/**
 * Tree Constructor()
 *
 * @since 3.8.0
 *
 * @param {string} storeId
 * @param {array} dirs string array of directories relative to
 * password store root directory
 */
function Tree(storeId = "", dirs = []) {
    this.id = storeId;
    this.tree = new Map();
    dirs.forEach((path) => {
        let paths = path.split("/");
        insert(this.tree, paths);
    });
}

/**
 * Recurssively inserts directories into the Tree
 *
 * @since 3.8.0
 *
 * @param {map} parentNode current map instance representing a directory
 * in the password store fs Tree.
 * @param {array} dirs array of strings for remaining directories
 *      to be inserted in the Tree.
 */
function insert(parentNode, dirs = []) {
    let dir = dirs.shift();
    // done, no more dirs to add
    if (dir == undefined) {
        return;
    }

    let node = parentNode.get(dir);

    if (node == undefined) {
        // doesn't exist, add it
        node = new Map();
        parentNode.set(dir, node);
    }

    insert(node, dirs);
}

/**
 * Recurssively loop over entire tree and return sum of nodes
 *
 * @since 3.8.0
 *
 * @param {map} parentNode current map instance, current directory
 * @returns {int} sum of all children nodes
 */
function size(parentNode) {
    let sum = 0;
    parentNode.forEach((node) => {
        sum = sum + size(node);
    })
    return sum + parentNode.size;
}

/**
 * Sends a 'tree' request to the host application
 * @since 3.8.0
 *
 * @throws {error} host response errors
 *
 * @param {object} settings Settings object
 * @returns {object} object of Trees with storeId as keys
 */
Tree.prototype.getAll = async function(settings) {
    // get list of directories
    let response = await chrome.runtime.sendMessage({ action: "listDirs" });
    if (response.status != "ok") {
        throw new Error(response.message);
    }

    let trees = {};
    for (const storeId in response.dirs) {
        trees[storeId] = new Tree(storeId, response.dirs[storeId]);
    }
    return trees;
}

Tree.prototype.search = function(fullPath = "") {
    let paths = fullPath.split("/");
    return searchTree(this.tree, paths);
}

function searchTree(parentNode, paths) {
    let searchTerm = paths.shift();
    // empty search, no matches found
    if (searchTerm == undefined) {
        return [];
    }

    let node = parentNode.get(searchTerm);

    // found exact directory match
    let results = []
    if (node != undefined) {
        // TODO: only include / search
        // 1. non-regex chars
        // 2. valid directory chars
        // results.push(searchTerm);
        // results.push(...searchTree(node, paths));
        // console.log(`searchTree(${searchTerm}), results:`, results)
        // return results;
        return searchTree(node, paths);
    }

    // no exact match, do fuzzy search
    parentNode.forEach((node, dir) => {
        // TODO: fix only allow [alphanum]
        if (dir.search(searchTerm) > -1) {
            results.push(dir);
        }
    });
    return results;
}

Tree.prototype.isTree = function(treeObj) {
    if (typeof treeObj == 'undefined') {
        return false;
    }

    return Tree.prototype.isPrototypeOf(treeObj);
}

module.exports = Tree
