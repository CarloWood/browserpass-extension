const m = require("mithril");
const Login = require("./models/Login");
const Settings = require("./models/Settings");
const Tree = require("./models/Tree");
const notify = require("./notifications");
const helpers = require("../helpers");
const layout = require("./layoutInterface");
const dialog = require("./modalDialog");

module.exports = AddEditInterface;

var persistSettingsModel = {};
const containsSymbolsRegEx = RegExp(/[#$%&'()*+,./:;<=>?@^_`{|}~."\[\]\\-]/, "gi");

function AddEditInterface(settingsModel) {
    persistSettingsModel = settingsModel;

    /**
     * AddEditView
     *
     * @since 3.8.0
     *
     * @param object vnode  current vnode object
     */
    return function (vnode) {
        // do some basic initialization
        var editing = false,
            passwordLength = 16,
            loginObj = {},
            settings = {},
            storePath = "",
            stores = [],
            symbols = true,
            canTree = false,
            storeTree = new Tree(),
            storeDirs = [],
            viewSettingsModel = persistSettingsModel;

        /**
         * Event handler for onkeydown, browse and select listed directory
         * options for login file path.
         *
         * @since 3.8.0
         *
         * @param {object} e key event
         */
        function pathKeyHandler(e) {
            let inputEl = document.querySelector("input.path");

            switch (e.code) {
                // Tab already handled
                case "ArrowUp":
                    e.preventDefault();
                    if (
                        e.target.classList.contains("directory") &&
                        e.target.previousElementSibling
                    ) {
                        e.target.previousElementSibling.focus();
                    } else if (e.target != inputEl) {
                        inputEl.focus();
                    }
                    break;
                case "ArrowDown":
                    e.preventDefault();
                    let paths = document.querySelector(".directory");

                    if (e.target == inputEl && paths != null) {
                        paths.focus();
                    } else if (
                        e.target.classList.contains("directory") &&
                        e.target.nextElementSibling
                    ) {
                        e.target.nextElementSibling.focus();
                    }
                    break;
                case "Enter":
                    e.preventDefault();
                    if (e.target.classList.contains("directory")) {
                        // replace search term with selected directory
                        inputEl.value = `${addDirToLoginPath(
                            loginObj.login,
                            e.target.getAttribute("value")
                        )}/`;
                        this.state.setLogin(inputEl.value);
                        inputEl.focus();
                    }
                    break;
                case "Home":
                case "End":
                    // only handle when list has focus
                    if (e.target.classList.contains("directory")) {
                        e.preventDefault();
                        const dirs = e.target.parentElement.children;
                        dirs.item(e.code == "End" ? dirs.length - 1 : 0).focus();
                    }
                    break;
                case "PageUp":
                case "PageDown":
                    // only handle when list has focus
                    if (e.target.classList.contains("directory")) {
                        e.preventDefault();
                        const dirs = Array.from(e.target.parentElement.children);
                        const current = dirs.findIndex(
                            (element) => element.innerText == e.target.innerText
                        );
                        let next = 0;
                        if (e.code == "PageUp") {
                            next = Math.max(0, current - 10);
                        } else {
                            next = Math.min(dirs.length - 1, current + 10);
                        }
                        dirs[next].focus();
                    }
                    break;
                default:
                    break;
            }
        }

        /**
         * Event handler for click, insert selected directory
         * for login file path.
         *
         * @since 3.8.0
         *
         * @param {object} e key event
         */
        function clickDirectoryHandler(e) {
            e.preventDefault();
            var inputEl = document.querySelector("input.path");

            // replace search term with selected directory
            inputEl.value = `${addDirToLoginPath(loginObj.login, e.target.getAttribute("value"))}/`;
            this.state.setLogin(inputEl.value);
            inputEl.focus();
        }

        /**
         * Rebuilds login file path given a selected directory to add.
         * @since 3.8.0
         *
         * @param {string} currentPath current value of loginObj.login
         * @param {string} dir selected directory to append to login file path
         * @returns {string} new login path
         */
        function addDirToLoginPath(currentPath, dir) {
            let parts = currentPath.split("/");
            let length = parts.length;
            if (length > 0) {
                parts[length - 1] = dir;
                return parts.join("/");
            }
            return dir;
        }

        /**
         * Reset or clear array of directory list for login path.
         *
         * Used in onclick or onfocus for elements not associated
         * with the login path or list of directories in the
         * password store tree.
         *
         * @since 3.8.0
         */
        function clearStoreDirs(e) {
            if (storeDirs.length > 0) {
                storeDirs = [];
                m.redraw();
            }
        }

        return {
            oncreate: function (vnode) {
                let elems = ["div.title", "div.location div.store", "div.contents"];
                elems.forEach((selector) => {
                    let el = document.querySelector(selector);
                    if (el != null) {
                        // add capturing event listener, not bubbling
                        el.addEventListener("click", clearStoreDirs.bind(vnode), true);
                    }
                });
            },
            oninit: async function (vnode) {
                tmpLogin = layout.getCurrentLogin();
                settings = await viewSettingsModel.get();

                Object.keys(settings.stores).forEach((k) => {
                    stores.push(settings.stores[k]);
                });

                // Show existing login
                if (vnode.attrs.context.login !== undefined) {
                    if (tmpLogin !== null && tmpLogin.login == vnode.attrs.context.login) {
                        // use existing decrypted login
                        loginObj = tmpLogin;
                    } else {
                        // no match, must re-decrypt login
                        loginObj = await Login.prototype.get(
                            settings,
                            vnode.attrs.context.storeid,
                            vnode.attrs.context.login
                        );
                    }
                    editing = true;
                } else {
                    // view instance should be a Login
                    loginObj = new Login(settings);
                }

                // set the storePath and get tree dirs
                canTree = Settings.prototype.canTree(settings);
                this.setStorePath();

                // trigger redraw after retrieving details
                if (
                    (editing && Login.prototype.isLogin(loginObj)) ||
                    Settings.prototype.isSettings(settings)
                ) {
                    // update default password options based on current password
                    const password = loginObj.getPassword();
                    // use current password length for default length
                    if (password.length > 0) {
                        this.setPasswordLength(password.length);

                        // if not blank and not using symbols, disable them for initial options
                        if (password.search(containsSymbolsRegEx) == -1) {
                            this.setSymbols(false);
                        }
                    }
                    m.redraw();
                }
            },
            /**
             * Update login path.
             * Used in onchange: m.withAttr("value", ...)
             *
             * @since 3.8.0
             *
             * @param {string} path
             */
            setLogin: function (path) {
                loginObj.login = path;
                if (canTree) {
                    storeDirs = storeTree.search(path);
                } else {
                    storeDirs = [];
                }
            },
            /**
             * Update pass length when generating secret in view.
             * Used onchange: m.withAttr("value", ...)
             *
             * @since 3.8.0
             *
             * @param {int} length
             */
            setPasswordLength: function (length) {
                passwordLength = length > 0 ? length : 1;
            },
            /**
             * Update login raw text and secret when "raw text" changes.
             * Used oninput: m.withAttr("value", ...)
             *
             * @since 3.8.0
             *
             * @param {string} text
             */
            setRawDetails: function (text) {
                loginObj.setRawDetails(text);
            },
            /**
             * Update login secret and raw text when "secret" changes.
             * Used oninput: m.withAttr("value", ...)
             *
             * @since 3.8.0
             *
             * @param {string} secret
             */
            setSecret: function (secret) {
                loginObj.setPassword(secret);
            },
            /**
             * Update login store id.
             * Used in onchange: m.withAttr("value", ...)
             *
             * @since 3.8.0
             *
             * @param {string} storeId
             */
            setStorePath: function (storeId) {
                if (editing) {
                    storePath = loginObj.store.path;
                    storeTree = canTree ? layout.getStoreTree(loginObj.store.id) : null;
                } else if (Settings.prototype.isSettings(settings)) {
                    if (typeof storeId == "string") {
                        loginObj.store = settings.stores[storeId];
                    } else {
                        loginObj.store = stores[0];
                    }
                    storePath = loginObj.store.path;
                    storeTree = canTree ? layout.getStoreTree(loginObj.store.id) : null;
                } else {
                    storePath = "~/.password-store";
                }
            },
            /**
             * Toggle checked on/off, determines if symbols
             * are used when generating a new random password.
             * Used in onchange: m.withAttr("value", ...)
             *
             * @since 3.8.0
             *
             * @param {int} checked value 1 or 0 for checked
             */
            setSymbols: function (checked) {
                symbols = checked;
            },
            /**
             * Mithril component view
             * @param {object} vnode
             * @returns {array} children vnodes
             */
            view: function (vnode) {
                var nodes = [];
                nodes.push(
                    m("div.title", [
                        m("div.btn.back", {
                            title: "Back to list",
                            onclick: () => {
                                m.route.set("/list");
                            },
                        }),
                        m("span", editing ? "Edit credentials" : "Add credentials"),
                        // html alignment element makes centering title span easier
                        m("div.btn.alignment"),
                    ]),
                    m("div.location", [
                        m("div.store", [
                            m(
                                "select",
                                {
                                    disabled: editing,
                                    title: "Select which password-store to save credentials in.",
                                    onchange: m.withAttr("value", this.setStorePath),
                                    onfocus: clearStoreDirs,
                                },
                                stores.map(function (store) {
                                    return m(
                                        "option",
                                        {
                                            value: store.id,
                                            selected: store.id == vnode.attrs.storeid,
                                        },
                                        store.name
                                    );
                                })
                            ),
                            m("div.storePath", storePath),
                        ]),
                        m("div.path", [
                            m("input[type=text].path", {
                                disabled: editing,
                                title: "File path of credentials within password-store.",
                                placeholder: "filename",
                                value: loginObj.login,
                                oninput: m.withAttr("value", this.setLogin),
                                onfocus: m.withAttr("value", this.setLogin),
                                onkeydown: pathKeyHandler.bind(vnode),
                            }),
                            m("div.suffix", ".gpg"),
                        ]),
                        canTree && storeDirs.length > 0
                            ? m(
                                  "div#tree-dirs",
                                  m(
                                      "div.dropdown",
                                      storeDirs.map(function (dirText) {
                                          return m(
                                              "a.directory",
                                              {
                                                  tabindex: 0,
                                                  value: dirText,
                                                  onkeydown: pathKeyHandler.bind(vnode),
                                                  onclick: clickDirectoryHandler.bind(vnode),
                                              },
                                              dirText
                                          );
                                      })
                                  )
                              )
                            : null,
                    ]),
                    m(
                        "div.contents",
                        {
                            // onclick: clearStoreDirsV2,
                            // onfocus: clearStoreDirsV2,
                        },
                        [
                            m("div.password", [
                                m("label", { for: "secret" }, "Secret"),
                                m(
                                    "div.chars",
                                    loginObj.hasOwnProperty("fields")
                                        ? helpers.highlight(loginObj.fields.secret)
                                        : ""
                                ),
                                m("div.btn.generate", {
                                    title: "Generate password",
                                    onclick: () => {
                                        loginObj.setPassword(
                                            loginObj.generateSecret(passwordLength, symbols)
                                        );
                                    },
                                }),
                            ]),
                            m("div.options", [
                                m("label", { for: "include_symbols" }, "Symbols"),
                                m("input[type=checkbox]", {
                                    id: "include_symbols",
                                    checked: symbols,
                                    onchange: m.withAttr("checked", this.setSymbols),
                                    onclick: (e) => {
                                        // disable redraw, otherwise check is cleared too fast
                                        e.redraw = false;
                                    },
                                    title: "Include symbols in generated password",
                                    value: 1,
                                }),
                                m("label", { for: "length" }, "Length"),
                                m("input[type=number]", {
                                    id: "length",
                                    title: "Length of generated password",
                                    value: passwordLength,
                                    oninput: m.withAttr("value", this.setPasswordLength),
                                }),
                            ]),
                            m(
                                "div.details",
                                m("textarea", {
                                    placeholder: `secret

user: johnsmith`,
                                    value: loginObj.raw,
                                    oninput: m.withAttr("value", this.setRawDetails),
                                })
                            ),
                        ]
                    )
                );

                if (
                    Settings.prototype.canDelete(settings) ||
                    Settings.prototype.canSave(settings)
                ) {
                    nodes.push(
                        m(
                            "div.actions",
                            {
                                oncreate: (vnode) => {
                                    // create capturing events, not bubbling
                                    document
                                        .querySelector("div.actions")
                                        .addEventListener(
                                            "click",
                                            clearStoreDirs.bind(vnode),
                                            true
                                        );
                                },
                            },
                            [
                                Settings.prototype.canSave(settings)
                                    ? m(
                                          "button.save",
                                          {
                                              title: "Save credentials",
                                              onclick: async (e) => {
                                                  e.preventDefault();

                                                  if (!Login.prototype.isValid(loginObj)) {
                                                      notify.errorMsg(
                                                          "Credentials are incomplete, please fix and try again."
                                                      );
                                                      return;
                                                  }

                                                  //  when adding, make sure file doesn't already exist
                                                  if (
                                                      !editing &&
                                                      layout.storeIncludesLogin(
                                                          loginObj.store.id,
                                                          loginObj.login
                                                      )
                                                  ) {
                                                      notify.errorMsg(
                                                          m.trust(
                                                              `Cannot add login, same filename already exists in <strong>${loginObj.store.name}</strong>. Please use edit instead.`
                                                          )
                                                      );
                                                      return;
                                                  }

                                                  const uuid = notify.infoMsg(
                                                      m.trust(
                                                          `Please wait, while we save: <strong>${loginObj.login}</strong>`
                                                      )
                                                  );
                                                  await Login.prototype.save(loginObj);
                                                  notify.removeMsg(uuid);
                                                  notify.successMsg(
                                                      m.trust(
                                                          `Password entry, <strong>${loginObj.login}</strong>, has been saved to <strong>${loginObj.store.name}</strong>.`
                                                      )
                                                  );
                                                  setTimeout(window.close, 3000);
                                                  m.route.set("/list");
                                              },
                                          },
                                          "Save"
                                      )
                                    : null,
                                editing && Settings.prototype.canDelete(settings)
                                    ? m(
                                          "button.delete",
                                          {
                                              title: "Delete credentials",
                                              onclick: (e) => {
                                                  e.preventDefault();

                                                  dialog.open(
                                                      `Are you sure you want to delete the file from <strong>${loginObj.store.name}</strong>? <strong>${loginObj.login}</strong>`,
                                                      async (remove) => {
                                                          if (!remove) {
                                                              return;
                                                          }

                                                          const uuid = notify.warningMsg(
                                                              m.trust(
                                                                  `Please wait, while we delete: <strong>${loginObj.login}</strong>`
                                                              )
                                                          );
                                                          await Login.prototype.delete(loginObj);
                                                          notify.removeMsg(uuid);
                                                          notify.successMsg(
                                                              m.trust(
                                                                  `Deleted password entry, <strong>${loginObj.login}</strong>, from <strong>${loginObj.store.name}</strong>.`
                                                              )
                                                          );
                                                          setTimeout(window.close, 3000);
                                                          m.route.set("/list");
                                                      }
                                                  );
                                              },
                                          },
                                          "Delete"
                                      )
                                    : null,
                            ]
                        )
                    );
                }

                return m("div.addEdit", nodes);
            },
        };
    };
}
