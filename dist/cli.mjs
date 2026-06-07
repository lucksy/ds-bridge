#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);
import {
  __commonJS,
  __require,
  __toESM
} from "./chunk-VL4BT7E7.mjs";

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports) {
    "use strict";
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports) {
    "use strict";
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.endsWith("...")) {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _collectValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        previous.push(value);
        return previous;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn5) {
        this.parseArg = fn5;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._collectValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports) {
    "use strict";
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.minWidthToWrap = 40;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
       * and just before calling `formatHelp()`.
       *
       * Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
       *
       * @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
       */
      prepareContext(contextOptions) {
        this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleSubcommandTerm(helper.subcommandTerm(command))
            )
          );
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleArgumentTerm(helper.argumentTerm(argument))
            )
          );
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          const extraDescription = `(${extraInfo.join(", ")})`;
          if (option.description) {
            return `${option.description} ${extraDescription}`;
          }
          return extraDescription;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescription = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescription}`;
          }
          return extraDescription;
        }
        return argument.description;
      }
      /**
       * Format a list of items, given a heading and an array of formatted items.
       *
       * @param {string} heading
       * @param {string[]} items
       * @param {Help} helper
       * @returns string[]
       */
      formatItemList(heading, items, helper) {
        if (items.length === 0) return [];
        return [helper.styleTitle(heading), ...items, ""];
      }
      /**
       * Group items by their help group heading.
       *
       * @param {Command[] | Option[]} unsortedItems
       * @param {Command[] | Option[]} visibleItems
       * @param {Function} getGroup
       * @returns {Map<string, Command[] | Option[]>}
       */
      groupItems(unsortedItems, visibleItems, getGroup) {
        const result = /* @__PURE__ */ new Map();
        unsortedItems.forEach((item) => {
          const group = getGroup(item);
          if (!result.has(group)) result.set(group, []);
        });
        visibleItems.forEach((item) => {
          const group = getGroup(item);
          if (!result.has(group)) {
            result.set(group, []);
          }
          result.get(group).push(item);
        });
        return result;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth ?? 80;
        function callFormatItem(term, description) {
          return helper.formatItem(term, termWidth, description, helper);
        }
        let output = [
          `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
          ""
        ];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.boxWrap(
              helper.styleCommandDescription(commandDescription),
              helpWidth
            ),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return callFormatItem(
            helper.styleArgumentTerm(helper.argumentTerm(argument)),
            helper.styleArgumentDescription(helper.argumentDescription(argument))
          );
        });
        output = output.concat(
          this.formatItemList("Arguments:", argumentList, helper)
        );
        const optionGroups = this.groupItems(
          cmd.options,
          helper.visibleOptions(cmd),
          (option) => option.helpGroupHeading ?? "Options:"
        );
        optionGroups.forEach((options, group) => {
          const optionList = options.map((option) => {
            return callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            );
          });
          output = output.concat(this.formatItemList(group, optionList, helper));
        });
        if (helper.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            );
          });
          output = output.concat(
            this.formatItemList("Global Options:", globalOptionList, helper)
          );
        }
        const commandGroups = this.groupItems(
          cmd.commands,
          helper.visibleCommands(cmd),
          (sub) => sub.helpGroup() || "Commands:"
        );
        commandGroups.forEach((commands, group) => {
          const commandList = commands.map((sub) => {
            return callFormatItem(
              helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
              helper.styleSubcommandDescription(helper.subcommandDescription(sub))
            );
          });
          output = output.concat(this.formatItemList(group, commandList, helper));
        });
        return output.join("\n");
      }
      /**
       * Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
       *
       * @param {string} str
       * @returns {number}
       */
      displayWidth(str) {
        return stripColor(str).length;
      }
      /**
       * Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
       *
       * @param {string} str
       * @returns {string}
       */
      styleTitle(str) {
        return str;
      }
      styleUsage(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word === "[command]") return this.styleSubcommandText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleCommandText(word);
        }).join(" ");
      }
      styleCommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleOptionDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleSubcommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleArgumentDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleDescriptionText(str) {
        return str;
      }
      styleOptionTerm(str) {
        return this.styleOptionText(str);
      }
      styleSubcommandTerm(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleSubcommandText(word);
        }).join(" ");
      }
      styleArgumentTerm(str) {
        return this.styleArgumentText(str);
      }
      styleOptionText(str) {
        return str;
      }
      styleArgumentText(str) {
        return str;
      }
      styleSubcommandText(str) {
        return str;
      }
      styleCommandText(str) {
        return str;
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Detect manually wrapped and indented strings by checking for line break followed by whitespace.
       *
       * @param {string} str
       * @returns {boolean}
       */
      preformatted(str) {
        return /\n[^\S\r\n]/.test(str);
      }
      /**
       * Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
       *
       * So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
       *   TTT  DDD DDDD
       *        DD DDD
       *
       * @param {string} term
       * @param {number} termWidth
       * @param {string} description
       * @param {Help} helper
       * @returns {string}
       */
      formatItem(term, termWidth, description, helper) {
        const itemIndent = 2;
        const itemIndentStr = " ".repeat(itemIndent);
        if (!description) return itemIndentStr + term;
        const paddedTerm = term.padEnd(
          termWidth + term.length - helper.displayWidth(term)
        );
        const spacerWidth = 2;
        const helpWidth = this.helpWidth ?? 80;
        const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
        let formattedDescription;
        if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
          formattedDescription = description;
        } else {
          const wrappedDescription = helper.boxWrap(description, remainingWidth);
          formattedDescription = wrappedDescription.replace(
            /\n/g,
            "\n" + " ".repeat(termWidth + spacerWidth)
          );
        }
        return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
      }
      /**
       * Wrap a string at whitespace, preserving existing line breaks.
       * Wrapping is skipped if the width is less than `minWidthToWrap`.
       *
       * @param {string} str
       * @param {number} width
       * @returns {string}
       */
      boxWrap(str, width) {
        if (width < this.minWidthToWrap) return str;
        const rawLines = str.split(/\r\n|\n/);
        const chunkPattern = /[\s]*[^\s]+/g;
        const wrappedLines = [];
        rawLines.forEach((line) => {
          const chunks = line.match(chunkPattern);
          if (chunks === null) {
            wrappedLines.push("");
            return;
          }
          let sumChunks = [chunks.shift()];
          let sumWidth = this.displayWidth(sumChunks[0]);
          chunks.forEach((chunk) => {
            const visibleWidth = this.displayWidth(chunk);
            if (sumWidth + visibleWidth <= width) {
              sumChunks.push(chunk);
              sumWidth += visibleWidth;
              return;
            }
            wrappedLines.push(sumChunks.join(""));
            const nextChunk = chunk.trimStart();
            sumChunks = [nextChunk];
            sumWidth = this.displayWidth(nextChunk);
          });
          wrappedLines.push(sumChunks.join(""));
        });
        return wrappedLines.join("\n");
      }
    };
    function stripColor(str) {
      const sgrPattern = /\x1b\[\d*(;\d*)*m/g;
      return str.replace(sgrPattern, "");
    }
    exports.Help = Help2;
    exports.stripColor = stripColor;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports) {
    "use strict";
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
        this.helpGroupHeading = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn5) {
        this.parseArg = fn5;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _collectValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        previous.push(value);
        return previous;
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._collectValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as an object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        if (this.negate) {
          return camelcase(this.name().replace(/^no-/, ""));
        }
        return camelcase(this.name());
      }
      /**
       * Set the help group heading.
       *
       * @param {string} heading
       * @return {Option}
       */
      helpGroup(heading) {
        this.helpGroupHeading = heading;
        return this;
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const shortFlagExp = /^-[^-]$/;
      const longFlagExp = /^--[^-]/;
      const flagParts = flags.split(/[ |,]+/).concat("guard");
      if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
      if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
      if (!shortFlag && shortFlagExp.test(flagParts[0]))
        shortFlag = flagParts.shift();
      if (!shortFlag && longFlagExp.test(flagParts[0])) {
        shortFlag = longFlag;
        longFlag = flagParts.shift();
      }
      if (flagParts[0].startsWith("-")) {
        const unsupportedFlag = flagParts[0];
        const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
        if (/^-[^-][^-]/.test(unsupportedFlag))
          throw new Error(
            `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`
          );
        if (shortFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many short flags`);
        if (longFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many long flags`);
        throw new Error(`${baseError}
- unrecognised flag format`);
      }
      if (shortFlag === void 0 && longFlag === void 0)
        throw new Error(
          `option creation failed due to no flags found in '${flags}'.`
        );
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports) {
    "use strict";
    var maxDistance = 3;
    function editDistance3(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance3(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports) {
    "use strict";
    var EventEmitter = __require("events").EventEmitter;
    var childProcess = __require("child_process");
    var path = __require("path");
    var fs = __require("fs");
    var process2 = __require("process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2, stripColor } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = false;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._savedState = null;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          outputError: (str, write) => write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
          getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
          stripColor: (str) => stripColor(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
        this._helpGroupHeading = void 0;
        this._defaultCommandGroup = void 0;
        this._defaultOptionGroup = void 0;
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // change how output being written, defaults to stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // change how output being written for errors, defaults to writeErr
       *     outputError(str, write) // used for displaying errors and not used for displaying help
       *     // specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // color support, currently only used with Help
       *     getOutHasColors()
       *     getErrHasColors()
       *     stripColor() // used to remove ANSI escape codes if output does not have colors
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        this._outputConfiguration = {
          ...this._outputConfiguration,
          ...configuration
        };
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom argument processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, parseArg, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof parseArg === "function") {
          argument.default(defaultValue).argParser(parseArg);
        } else {
          argument.default(parseArg);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument?.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          if (enableOrNameAndArgs && this._defaultCommandGroup) {
            this._initCommandGroup(this._getHelpCommand());
          }
          return this;
        }
        const nameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        if (enableOrNameAndArgs || description) this._initCommandGroup(helpCommand);
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        this._initCommandGroup(helpCommand);
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn5) {
        if (fn5) {
          this._exitCallback = fn5;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn5) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn5.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this._initOptionGroup(option);
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this._initCommandGroup(command);
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._collectValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn5, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn5 === "function") {
          option.default(defaultValue).argParser(fn5);
        } else if (fn5 instanceof RegExp) {
          const regex = fn5;
          fn5 = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn5);
        } else {
          option.default(fn5);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine2 = true) {
        this._combineFlagAndOptionalValue = !!combine2;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      _prepareForParse() {
        if (this._savedState === null) {
          this.saveStateBeforeParse();
        } else {
          this.restoreStateBeforeParse();
        }
      }
      /**
       * Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state saved.
       */
      saveStateBeforeParse() {
        this._savedState = {
          // name is stable if supplied by author, but may be unspecified for root command and deduced during parsing
          _name: this._name,
          // option values before parse have default values (including false for negated options)
          // shallow clones
          _optionValues: { ...this._optionValues },
          _optionValueSources: { ...this._optionValueSources }
        };
      }
      /**
       * Restore state before parse for calls after the first.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state restored.
       */
      restoreStateBeforeParse() {
        if (this._storeOptionsAsProperties)
          throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
        this._name = this._savedState._name;
        this._scriptPath = null;
        this.rawArgs = [];
        this._optionValues = { ...this._savedState._optionValues };
        this._optionValueSources = { ...this._savedState._optionValueSources };
        this.args = [];
        this.processedArgs = [];
      }
      /**
       * Throw if expected executable is missing. Add lots of help for author.
       *
       * @param {string} executableFile
       * @param {string} executableDir
       * @param {string} subcommandName
       */
      _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
        if (fs.existsSync(executableFile)) return;
        const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
        const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
        throw new Error(executableMissing);
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path.resolve(baseDir, baseName);
          if (fs.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs.realpathSync(this._scriptPath);
          } catch {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path.resolve(
            path.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path.basename(
              this._scriptPath,
              path.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          this._checkForMissingExecutable(
            executableFile,
            executableDir,
            subcommand._name
          );
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            this._checkForMissingExecutable(
              executableFile,
              executableDir,
              subcommand._name
            );
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        subCommand._prepareForParse();
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn5) {
        if (promise?.then && typeof promise.then === "function") {
          return promise.then(() => fn5());
        }
        return fn5();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent?.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Side effects: modifies command by storing options. Does not reset state if called again.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} args
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(args) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        const negativeNumberArg = (arg) => {
          if (!/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg)) return false;
          return !this._getCommandAndAncestors().some(
            (cmd) => cmd.options.map((opt) => opt.short).some((short) => /^-\d$/.test(short))
          );
        };
        let activeVariadicOption = null;
        let activeGroup = null;
        let i = 0;
        while (i < args.length || activeGroup) {
          const arg = activeGroup ?? args[i++];
          activeGroup = null;
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args.slice(i));
            break;
          }
          if (activeVariadicOption && (!maybeOption(arg) || negativeNumberArg(arg))) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args[i++];
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (i < args.length && (!maybeOption(args[i]) || negativeNumberArg(args[i]))) {
                  value = args[i++];
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                activeGroup = `-${arg.slice(2)}`;
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (dest === operands && maybeOption(arg) && !(this.commands.length === 0 && negativeNumberArg(arg))) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              unknown.push(...args.slice(i));
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg, ...args.slice(i));
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg, ...args.slice(i));
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg, ...args.slice(i));
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames2 = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames2.push(command.name());
            if (command.alias()) candidateNames2.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames2);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set/get the help group heading for this subcommand in parent command's help.
       *
       * @param {string} [heading]
       * @return {Command | string}
       */
      helpGroup(heading) {
        if (heading === void 0) return this._helpGroupHeading ?? "";
        this._helpGroupHeading = heading;
        return this;
      }
      /**
       * Set/get the default help group heading for subcommands added to this command.
       * (This does not override a group set directly on the subcommand using .helpGroup().)
       *
       * @example
       * program.commandsGroup('Development Commands:);
       * program.command('watch')...
       * program.command('lint')...
       * ...
       *
       * @param {string} [heading]
       * @returns {Command | string}
       */
      commandsGroup(heading) {
        if (heading === void 0) return this._defaultCommandGroup ?? "";
        this._defaultCommandGroup = heading;
        return this;
      }
      /**
       * Set/get the default help group heading for options added to this command.
       * (This does not override a group set directly on the option using .helpGroup().)
       *
       * @example
       * program
       *   .optionsGroup('Development Options:')
       *   .option('-d, --debug', 'output extra debugging')
       *   .option('-p, --profile', 'output profiling information')
       *
       * @param {string} [heading]
       * @returns {Command | string}
       */
      optionsGroup(heading) {
        if (heading === void 0) return this._defaultOptionGroup ?? "";
        this._defaultOptionGroup = heading;
        return this;
      }
      /**
       * @param {Option} option
       * @private
       */
      _initOptionGroup(option) {
        if (this._defaultOptionGroup && !option.helpGroupHeading)
          option.helpGroup(this._defaultOptionGroup);
      }
      /**
       * @param {Command} cmd
       * @private
       */
      _initCommandGroup(cmd) {
        if (this._defaultCommandGroup && !cmd.helpGroup())
          cmd.helpGroup(this._defaultCommandGroup);
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path.basename(filename, path.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path2) {
        if (path2 === void 0) return this._executableDir;
        this._executableDir = path2;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        const context = this._getOutputContext(contextOptions);
        helper.prepareContext({
          error: context.error,
          helpWidth: context.helpWidth,
          outputHasColors: context.hasColors
        });
        const text = helper.formatHelp(this, helper);
        if (context.hasColors) return text;
        return this._outputConfiguration.stripColor(text);
      }
      /**
       * @typedef HelpContext
       * @type {object}
       * @property {boolean} error
       * @property {number} helpWidth
       * @property {boolean} hasColors
       * @property {function} write - includes stripColor if needed
       *
       * @returns {HelpContext}
       * @private
       */
      _getOutputContext(contextOptions) {
        contextOptions = contextOptions || {};
        const error = !!contextOptions.error;
        let baseWrite;
        let hasColors;
        let helpWidth;
        if (error) {
          baseWrite = (str) => this._outputConfiguration.writeErr(str);
          hasColors = this._outputConfiguration.getErrHasColors();
          helpWidth = this._outputConfiguration.getErrHelpWidth();
        } else {
          baseWrite = (str) => this._outputConfiguration.writeOut(str);
          hasColors = this._outputConfiguration.getOutHasColors();
          helpWidth = this._outputConfiguration.getOutHelpWidth();
        }
        const write = (str) => {
          if (!hasColors) str = this._outputConfiguration.stripColor(str);
          return baseWrite(str);
        };
        return { error, write, hasColors, helpWidth };
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const outputContext = this._getOutputContext(contextOptions);
        const eventContext = {
          error: outputContext.error,
          write: outputContext.write,
          command: this
        };
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
        this.emit("beforeHelp", eventContext);
        let helpInformation = this.helpInformation({ error: outputContext.error });
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        outputContext.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", eventContext);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", eventContext)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            if (this._helpOption === null) this._helpOption = void 0;
            if (this._defaultOptionGroup) {
              this._initOptionGroup(this._getHelpOption());
            }
          } else {
            this._helpOption = null;
          }
          return this;
        }
        this._helpOption = this.createOption(
          flags ?? "-h, --help",
          description ?? "display help for command"
        );
        if (flags || description) this._initOptionGroup(this._helpOption);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        this._initOptionGroup(option);
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = Number(process2.exitCode ?? 0);
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * // Do a little typing to coordinate emit and listener for the help text events.
       * @typedef HelpTextEventContext
       * @type {object}
       * @property {boolean} error
       * @property {Command} command
       * @property {function} write
       */
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    function useColor() {
      if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
        return false;
      if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== void 0)
        return true;
      return void 0;
    }
    exports.Command = Command2;
    exports.useColor = useColor;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports) {
    "use strict";
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name) => new Command2(name);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name, description) => new Argument2(name, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// node_modules/picocolors/picocolors.js
var require_picocolors = __commonJS({
  "node_modules/picocolors/picocolors.js"(exports, module) {
    "use strict";
    var p4 = process || {};
    var argv = p4.argv || [];
    var env = p4.env || {};
    var isColorSupported = !(!!env.NO_COLOR || argv.includes("--no-color")) && (!!env.FORCE_COLOR || argv.includes("--color") || p4.platform === "win32" || (p4.stdout || {}).isTTY && env.TERM !== "dumb" || !!env.CI);
    var formatter = (open, close, replace = open) => (input) => {
      let string = "" + input, index = string.indexOf(close, open.length);
      return ~index ? open + replaceClose(string, close, replace, index) + close : open + string + close;
    };
    var replaceClose = (string, close, replace, index) => {
      let result = "", cursor = 0;
      do {
        result += string.substring(cursor, index) + replace;
        cursor = index + close.length;
        index = string.indexOf(close, cursor);
      } while (~index);
      return result + string.substring(cursor);
    };
    var createColors = (enabled = isColorSupported) => {
      let f3 = enabled ? formatter : () => String;
      return {
        isColorSupported: enabled,
        reset: f3("\x1B[0m", "\x1B[0m"),
        bold: f3("\x1B[1m", "\x1B[22m", "\x1B[22m\x1B[1m"),
        dim: f3("\x1B[2m", "\x1B[22m", "\x1B[22m\x1B[2m"),
        italic: f3("\x1B[3m", "\x1B[23m"),
        underline: f3("\x1B[4m", "\x1B[24m"),
        inverse: f3("\x1B[7m", "\x1B[27m"),
        hidden: f3("\x1B[8m", "\x1B[28m"),
        strikethrough: f3("\x1B[9m", "\x1B[29m"),
        black: f3("\x1B[30m", "\x1B[39m"),
        red: f3("\x1B[31m", "\x1B[39m"),
        green: f3("\x1B[32m", "\x1B[39m"),
        yellow: f3("\x1B[33m", "\x1B[39m"),
        blue: f3("\x1B[34m", "\x1B[39m"),
        magenta: f3("\x1B[35m", "\x1B[39m"),
        cyan: f3("\x1B[36m", "\x1B[39m"),
        white: f3("\x1B[37m", "\x1B[39m"),
        gray: f3("\x1B[90m", "\x1B[39m"),
        bgBlack: f3("\x1B[40m", "\x1B[49m"),
        bgRed: f3("\x1B[41m", "\x1B[49m"),
        bgGreen: f3("\x1B[42m", "\x1B[49m"),
        bgYellow: f3("\x1B[43m", "\x1B[49m"),
        bgBlue: f3("\x1B[44m", "\x1B[49m"),
        bgMagenta: f3("\x1B[45m", "\x1B[49m"),
        bgCyan: f3("\x1B[46m", "\x1B[49m"),
        bgWhite: f3("\x1B[47m", "\x1B[49m"),
        blackBright: f3("\x1B[90m", "\x1B[39m"),
        redBright: f3("\x1B[91m", "\x1B[39m"),
        greenBright: f3("\x1B[92m", "\x1B[39m"),
        yellowBright: f3("\x1B[93m", "\x1B[39m"),
        blueBright: f3("\x1B[94m", "\x1B[39m"),
        magentaBright: f3("\x1B[95m", "\x1B[39m"),
        cyanBright: f3("\x1B[96m", "\x1B[39m"),
        whiteBright: f3("\x1B[97m", "\x1B[39m"),
        bgBlackBright: f3("\x1B[100m", "\x1B[49m"),
        bgRedBright: f3("\x1B[101m", "\x1B[49m"),
        bgGreenBright: f3("\x1B[102m", "\x1B[49m"),
        bgYellowBright: f3("\x1B[103m", "\x1B[49m"),
        bgBlueBright: f3("\x1B[104m", "\x1B[49m"),
        bgMagentaBright: f3("\x1B[105m", "\x1B[49m"),
        bgCyanBright: f3("\x1B[106m", "\x1B[49m"),
        bgWhiteBright: f3("\x1B[107m", "\x1B[49m")
      };
    };
    module.exports = createColors();
    module.exports.createColors = createColors;
  }
});

// src/cli.ts
import { createRequire } from "module";

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// src/cli-commands/a11y.ts
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync
} from "fs";
import { join as join2, resolve as resolve4 } from "path";

// node_modules/culori/src/rgb/parseNumber.js
var parseNumber = (color, len) => {
  if (typeof color !== "number") return;
  if (len === 3) {
    return {
      mode: "rgb",
      r: (color >> 8 & 15 | color >> 4 & 240) / 255,
      g: (color >> 4 & 15 | color & 240) / 255,
      b: (color & 15 | color << 4 & 240) / 255
    };
  }
  if (len === 4) {
    return {
      mode: "rgb",
      r: (color >> 12 & 15 | color >> 8 & 240) / 255,
      g: (color >> 8 & 15 | color >> 4 & 240) / 255,
      b: (color >> 4 & 15 | color & 240) / 255,
      alpha: (color & 15 | color << 4 & 240) / 255
    };
  }
  if (len === 6) {
    return {
      mode: "rgb",
      r: (color >> 16 & 255) / 255,
      g: (color >> 8 & 255) / 255,
      b: (color & 255) / 255
    };
  }
  if (len === 8) {
    return {
      mode: "rgb",
      r: (color >> 24 & 255) / 255,
      g: (color >> 16 & 255) / 255,
      b: (color >> 8 & 255) / 255,
      alpha: (color & 255) / 255
    };
  }
};
var parseNumber_default = parseNumber;

// node_modules/culori/src/colors/named.js
var named = {
  aliceblue: 15792383,
  antiquewhite: 16444375,
  aqua: 65535,
  aquamarine: 8388564,
  azure: 15794175,
  beige: 16119260,
  bisque: 16770244,
  black: 0,
  blanchedalmond: 16772045,
  blue: 255,
  blueviolet: 9055202,
  brown: 10824234,
  burlywood: 14596231,
  cadetblue: 6266528,
  chartreuse: 8388352,
  chocolate: 13789470,
  coral: 16744272,
  cornflowerblue: 6591981,
  cornsilk: 16775388,
  crimson: 14423100,
  cyan: 65535,
  darkblue: 139,
  darkcyan: 35723,
  darkgoldenrod: 12092939,
  darkgray: 11119017,
  darkgreen: 25600,
  darkgrey: 11119017,
  darkkhaki: 12433259,
  darkmagenta: 9109643,
  darkolivegreen: 5597999,
  darkorange: 16747520,
  darkorchid: 10040012,
  darkred: 9109504,
  darksalmon: 15308410,
  darkseagreen: 9419919,
  darkslateblue: 4734347,
  darkslategray: 3100495,
  darkslategrey: 3100495,
  darkturquoise: 52945,
  darkviolet: 9699539,
  deeppink: 16716947,
  deepskyblue: 49151,
  dimgray: 6908265,
  dimgrey: 6908265,
  dodgerblue: 2003199,
  firebrick: 11674146,
  floralwhite: 16775920,
  forestgreen: 2263842,
  fuchsia: 16711935,
  gainsboro: 14474460,
  ghostwhite: 16316671,
  gold: 16766720,
  goldenrod: 14329120,
  gray: 8421504,
  green: 32768,
  greenyellow: 11403055,
  grey: 8421504,
  honeydew: 15794160,
  hotpink: 16738740,
  indianred: 13458524,
  indigo: 4915330,
  ivory: 16777200,
  khaki: 15787660,
  lavender: 15132410,
  lavenderblush: 16773365,
  lawngreen: 8190976,
  lemonchiffon: 16775885,
  lightblue: 11393254,
  lightcoral: 15761536,
  lightcyan: 14745599,
  lightgoldenrodyellow: 16448210,
  lightgray: 13882323,
  lightgreen: 9498256,
  lightgrey: 13882323,
  lightpink: 16758465,
  lightsalmon: 16752762,
  lightseagreen: 2142890,
  lightskyblue: 8900346,
  lightslategray: 7833753,
  lightslategrey: 7833753,
  lightsteelblue: 11584734,
  lightyellow: 16777184,
  lime: 65280,
  limegreen: 3329330,
  linen: 16445670,
  magenta: 16711935,
  maroon: 8388608,
  mediumaquamarine: 6737322,
  mediumblue: 205,
  mediumorchid: 12211667,
  mediumpurple: 9662683,
  mediumseagreen: 3978097,
  mediumslateblue: 8087790,
  mediumspringgreen: 64154,
  mediumturquoise: 4772300,
  mediumvioletred: 13047173,
  midnightblue: 1644912,
  mintcream: 16121850,
  mistyrose: 16770273,
  moccasin: 16770229,
  navajowhite: 16768685,
  navy: 128,
  oldlace: 16643558,
  olive: 8421376,
  olivedrab: 7048739,
  orange: 16753920,
  orangered: 16729344,
  orchid: 14315734,
  palegoldenrod: 15657130,
  palegreen: 10025880,
  paleturquoise: 11529966,
  palevioletred: 14381203,
  papayawhip: 16773077,
  peachpuff: 16767673,
  peru: 13468991,
  pink: 16761035,
  plum: 14524637,
  powderblue: 11591910,
  purple: 8388736,
  // Added in CSS Colors Level 4:
  // https://drafts.csswg.org/css-color/#changes-from-3
  rebeccapurple: 6697881,
  red: 16711680,
  rosybrown: 12357519,
  royalblue: 4286945,
  saddlebrown: 9127187,
  salmon: 16416882,
  sandybrown: 16032864,
  seagreen: 3050327,
  seashell: 16774638,
  sienna: 10506797,
  silver: 12632256,
  skyblue: 8900331,
  slateblue: 6970061,
  slategray: 7372944,
  slategrey: 7372944,
  snow: 16775930,
  springgreen: 65407,
  steelblue: 4620980,
  tan: 13808780,
  teal: 32896,
  thistle: 14204888,
  tomato: 16737095,
  turquoise: 4251856,
  violet: 15631086,
  wheat: 16113331,
  white: 16777215,
  whitesmoke: 16119285,
  yellow: 16776960,
  yellowgreen: 10145074
};
var named_default = named;

// node_modules/culori/src/rgb/parseNamed.js
var parseNamed = (color) => {
  return parseNumber_default(named_default[color.toLowerCase()], 6);
};
var parseNamed_default = parseNamed;

// node_modules/culori/src/rgb/parseHex.js
var hex = /^#?([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i;
var parseHex = (color) => {
  let match;
  return (match = color.match(hex)) ? parseNumber_default(parseInt(match[1], 16), match[1].length) : void 0;
};
var parseHex_default = parseHex;

// node_modules/culori/src/util/regex.js
var num = "([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)";
var num_none = `(?:${num}|none)`;
var per = `${num}%`;
var per_none = `(?:${num}%|none)`;
var num_per = `(?:${num}%|${num})`;
var num_per_none = `(?:${num}%|${num}|none)`;
var hue = `(?:${num}(deg|grad|rad|turn)|${num})`;
var hue_none = `(?:${num}(deg|grad|rad|turn)|${num}|none)`;
var c = `\\s*,\\s*`;
var rx_num_per_none = new RegExp("^" + num_per_none + "$");

// node_modules/culori/src/rgb/parseRgbLegacy.js
var rgb_num_old = new RegExp(
  `^rgba?\\(\\s*${num}${c}${num}${c}${num}\\s*(?:,\\s*${num_per}\\s*)?\\)$`
);
var rgb_per_old = new RegExp(
  `^rgba?\\(\\s*${per}${c}${per}${c}${per}\\s*(?:,\\s*${num_per}\\s*)?\\)$`
);
var parseRgbLegacy = (color) => {
  let res = { mode: "rgb" };
  let match;
  if (match = color.match(rgb_num_old)) {
    if (match[1] !== void 0) {
      res.r = match[1] / 255;
    }
    if (match[2] !== void 0) {
      res.g = match[2] / 255;
    }
    if (match[3] !== void 0) {
      res.b = match[3] / 255;
    }
  } else if (match = color.match(rgb_per_old)) {
    if (match[1] !== void 0) {
      res.r = match[1] / 100;
    }
    if (match[2] !== void 0) {
      res.g = match[2] / 100;
    }
    if (match[3] !== void 0) {
      res.b = match[3] / 100;
    }
  } else {
    return void 0;
  }
  if (match[4] !== void 0) {
    res.alpha = Math.max(0, Math.min(1, match[4] / 100));
  } else if (match[5] !== void 0) {
    res.alpha = Math.max(0, Math.min(1, +match[5]));
  }
  return res;
};
var parseRgbLegacy_default = parseRgbLegacy;

// node_modules/culori/src/_prepare.js
var prepare = (color, mode) => color === void 0 ? void 0 : typeof color !== "object" ? parse_default(color) : color.mode !== void 0 ? color : mode ? { ...color, mode } : void 0;
var prepare_default = prepare;

// node_modules/culori/src/converter.js
var converter = (target_mode = "rgb") => (color) => (color = prepare_default(color, target_mode)) !== void 0 ? (
  // if the color's mode corresponds to our target mode
  color.mode === target_mode ? (
    // then just return the color
    color
  ) : (
    // otherwise check to see if we have a dedicated
    // converter for the target mode
    converters[color.mode][target_mode] ? (
      // and return its result...
      converters[color.mode][target_mode](color)
    ) : (
      // ...otherwise pass through RGB as an intermediary step.
      // if the target mode is RGB...
      target_mode === "rgb" ? (
        // just return the RGB
        converters[color.mode].rgb(color)
      ) : (
        // otherwise convert color.mode -> RGB -> target_mode
        converters.rgb[target_mode](converters[color.mode].rgb(color))
      )
    )
  )
) : void 0;
var converter_default = converter;

// node_modules/culori/src/modes.js
var converters = {};
var modes = {};
var parsers = [];
var colorProfiles = {};
var identity = (v) => v;
var useMode = (definition29) => {
  converters[definition29.mode] = {
    ...converters[definition29.mode],
    ...definition29.toMode
  };
  Object.keys(definition29.fromMode || {}).forEach((k4) => {
    if (!converters[k4]) {
      converters[k4] = {};
    }
    converters[k4][definition29.mode] = definition29.fromMode[k4];
  });
  if (!definition29.ranges) {
    definition29.ranges = {};
  }
  if (!definition29.difference) {
    definition29.difference = {};
  }
  definition29.channels.forEach((channel) => {
    if (definition29.ranges[channel] === void 0) {
      definition29.ranges[channel] = [0, 1];
    }
    if (!definition29.interpolate[channel]) {
      throw new Error(`Missing interpolator for: ${channel}`);
    }
    if (typeof definition29.interpolate[channel] === "function") {
      definition29.interpolate[channel] = {
        use: definition29.interpolate[channel]
      };
    }
    if (!definition29.interpolate[channel].fixup) {
      definition29.interpolate[channel].fixup = identity;
    }
  });
  modes[definition29.mode] = definition29;
  (definition29.parse || []).forEach((parser) => {
    useParser(parser, definition29.mode);
  });
  return converter_default(definition29.mode);
};
var getMode = (mode) => modes[mode];
var useParser = (parser, mode) => {
  if (typeof parser === "string") {
    if (!mode) {
      throw new Error(`'mode' required when 'parser' is a string`);
    }
    colorProfiles[parser] = mode;
  } else if (typeof parser === "function") {
    if (parsers.indexOf(parser) < 0) {
      parsers.push(parser);
    }
  }
};

// node_modules/culori/src/parse.js
var IdentStartCodePoint = /[^\x00-\x7F]|[a-zA-Z_]/;
var IdentCodePoint = /[^\x00-\x7F]|[-\w]/;
var Tok = {
  Function: "function",
  Ident: "ident",
  Number: "number",
  Percentage: "percentage",
  ParenClose: ")",
  None: "none",
  Hue: "hue",
  Alpha: "alpha"
};
var _i = 0;
function is_num(chars) {
  let ch = chars[_i];
  let ch1 = chars[_i + 1];
  if (ch === "-" || ch === "+") {
    return /\d/.test(ch1) || ch1 === "." && /\d/.test(chars[_i + 2]);
  }
  if (ch === ".") {
    return /\d/.test(ch1);
  }
  return /\d/.test(ch);
}
function is_ident(chars) {
  if (_i >= chars.length) {
    return false;
  }
  let ch = chars[_i];
  if (IdentStartCodePoint.test(ch)) {
    return true;
  }
  if (ch === "-") {
    if (chars.length - _i < 2) {
      return false;
    }
    let ch1 = chars[_i + 1];
    if (ch1 === "-" || IdentStartCodePoint.test(ch1)) {
      return true;
    }
    return false;
  }
  return false;
}
var huenits = {
  deg: 1,
  rad: 180 / Math.PI,
  grad: 9 / 10,
  turn: 360
};
function num2(chars) {
  let value = "";
  if (chars[_i] === "-" || chars[_i] === "+") {
    value += chars[_i++];
  }
  value += digits(chars);
  if (chars[_i] === "." && /\d/.test(chars[_i + 1])) {
    value += chars[_i++] + digits(chars);
  }
  if (chars[_i] === "e" || chars[_i] === "E") {
    if ((chars[_i + 1] === "-" || chars[_i + 1] === "+") && /\d/.test(chars[_i + 2])) {
      value += chars[_i++] + chars[_i++] + digits(chars);
    } else if (/\d/.test(chars[_i + 1])) {
      value += chars[_i++] + digits(chars);
    }
  }
  if (is_ident(chars)) {
    let id = ident(chars);
    if (id === "deg" || id === "rad" || id === "turn" || id === "grad") {
      return { type: Tok.Hue, value: value * huenits[id] };
    }
    return void 0;
  }
  if (chars[_i] === "%") {
    _i++;
    return { type: Tok.Percentage, value: +value };
  }
  return { type: Tok.Number, value: +value };
}
function digits(chars) {
  let v = "";
  while (/\d/.test(chars[_i])) {
    v += chars[_i++];
  }
  return v;
}
function ident(chars) {
  let v = "";
  while (_i < chars.length && IdentCodePoint.test(chars[_i])) {
    v += chars[_i++];
  }
  return v;
}
function identlike(chars) {
  let v = ident(chars);
  if (chars[_i] === "(") {
    _i++;
    return { type: Tok.Function, value: v };
  }
  if (v === "none") {
    return { type: Tok.None, value: void 0 };
  }
  return { type: Tok.Ident, value: v };
}
function tokenize(str = "") {
  let chars = str.trim();
  let tokens = [];
  let ch;
  _i = 0;
  while (_i < chars.length) {
    ch = chars[_i++];
    if (ch === "\n" || ch === "	" || ch === " ") {
      while (_i < chars.length && (chars[_i] === "\n" || chars[_i] === "	" || chars[_i] === " ")) {
        _i++;
      }
      continue;
    }
    if (ch === ",") {
      return void 0;
    }
    if (ch === ")") {
      tokens.push({ type: Tok.ParenClose });
      continue;
    }
    if (ch === "+") {
      _i--;
      if (is_num(chars)) {
        tokens.push(num2(chars));
        continue;
      }
      return void 0;
    }
    if (ch === "-") {
      _i--;
      if (is_num(chars)) {
        tokens.push(num2(chars));
        continue;
      }
      if (is_ident(chars)) {
        tokens.push({ type: Tok.Ident, value: ident(chars) });
        continue;
      }
      return void 0;
    }
    if (ch === ".") {
      _i--;
      if (is_num(chars)) {
        tokens.push(num2(chars));
        continue;
      }
      return void 0;
    }
    if (ch === "/") {
      while (_i < chars.length && (chars[_i] === "\n" || chars[_i] === "	" || chars[_i] === " ")) {
        _i++;
      }
      let alpha;
      if (is_num(chars)) {
        alpha = num2(chars);
        if (alpha.type !== Tok.Hue) {
          tokens.push({ type: Tok.Alpha, value: alpha });
          continue;
        }
      }
      if (is_ident(chars)) {
        if (ident(chars) === "none") {
          tokens.push({
            type: Tok.Alpha,
            value: { type: Tok.None, value: void 0 }
          });
          continue;
        }
      }
      return void 0;
    }
    if (/\d/.test(ch)) {
      _i--;
      tokens.push(num2(chars));
      continue;
    }
    if (IdentStartCodePoint.test(ch)) {
      _i--;
      tokens.push(identlike(chars));
      continue;
    }
    return void 0;
  }
  return tokens;
}
function parseColorSyntax(tokens) {
  tokens._i = 0;
  let token = tokens[tokens._i++];
  if (!token || token.type !== Tok.Function || token.value !== "color") {
    return void 0;
  }
  token = tokens[tokens._i++];
  if (token.type !== Tok.Ident) {
    return void 0;
  }
  const mode = colorProfiles[token.value];
  if (!mode) {
    return void 0;
  }
  const res = { mode };
  const coords = consumeCoords(tokens, false);
  if (!coords) {
    return void 0;
  }
  const channels = getMode(mode).channels;
  for (let ii = 0, c2, ch; ii < channels.length; ii++) {
    c2 = coords[ii];
    ch = channels[ii];
    if (c2.type !== Tok.None) {
      res[ch] = c2.type === Tok.Number ? c2.value : c2.value / 100;
      if (ch === "alpha") {
        res[ch] = Math.max(0, Math.min(1, res[ch]));
      }
    }
  }
  return res;
}
function consumeCoords(tokens, includeHue) {
  const coords = [];
  let token;
  while (tokens._i < tokens.length) {
    token = tokens[tokens._i++];
    if (token.type === Tok.None || token.type === Tok.Number || token.type === Tok.Alpha || token.type === Tok.Percentage || includeHue && token.type === Tok.Hue) {
      coords.push(token);
      continue;
    }
    if (token.type === Tok.ParenClose) {
      if (tokens._i < tokens.length) {
        return void 0;
      }
      continue;
    }
    return void 0;
  }
  if (coords.length < 3 || coords.length > 4) {
    return void 0;
  }
  if (coords.length === 4) {
    if (coords[3].type !== Tok.Alpha) {
      return void 0;
    }
    coords[3] = coords[3].value;
  }
  if (coords.length === 3) {
    coords.push({ type: Tok.None, value: void 0 });
  }
  return coords.every((c2) => c2.type !== Tok.Alpha) ? coords : void 0;
}
function parseModernSyntax(tokens, includeHue) {
  tokens._i = 0;
  let token = tokens[tokens._i++];
  if (!token || token.type !== Tok.Function) {
    return void 0;
  }
  let coords = consumeCoords(tokens, includeHue);
  if (!coords) {
    return void 0;
  }
  coords.unshift(token.value);
  return coords;
}
var parse = (color) => {
  if (typeof color !== "string") {
    return void 0;
  }
  const tokens = tokenize(color);
  const parsed = tokens ? parseModernSyntax(tokens, true) : void 0;
  let result = void 0;
  let i = 0;
  let len = parsers.length;
  while (i < len) {
    if ((result = parsers[i++](color, parsed)) !== void 0) {
      return result;
    }
  }
  return tokens ? parseColorSyntax(tokens) : void 0;
};
var parse_default = parse;

// node_modules/culori/src/rgb/parseRgb.js
function parseRgb(color, parsed) {
  if (!parsed || parsed[0] !== "rgb" && parsed[0] !== "rgba") {
    return void 0;
  }
  const res = { mode: "rgb" };
  const [, r2, g, b, alpha] = parsed;
  if (r2.type === Tok.Hue || g.type === Tok.Hue || b.type === Tok.Hue) {
    return void 0;
  }
  if (r2.type !== Tok.None) {
    res.r = r2.type === Tok.Number ? r2.value / 255 : r2.value / 100;
  }
  if (g.type !== Tok.None) {
    res.g = g.type === Tok.Number ? g.value / 255 : g.value / 100;
  }
  if (b.type !== Tok.None) {
    res.b = b.type === Tok.Number ? b.value / 255 : b.value / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseRgb_default = parseRgb;

// node_modules/culori/src/rgb/parseTransparent.js
var parseTransparent = (c2) => c2 === "transparent" ? { mode: "rgb", r: 0, g: 0, b: 0, alpha: 0 } : void 0;
var parseTransparent_default = parseTransparent;

// node_modules/culori/src/interpolate/lerp.js
var lerp = (a, b, t) => a + t * (b - a);

// node_modules/culori/src/interpolate/piecewise.js
var get_classes = (arr) => {
  let classes = [];
  for (let i = 0; i < arr.length - 1; i++) {
    let a = arr[i];
    let b = arr[i + 1];
    if (a === void 0 && b === void 0) {
      classes.push(void 0);
    } else if (a !== void 0 && b !== void 0) {
      classes.push([a, b]);
    } else {
      classes.push(a !== void 0 ? [a, a] : [b, b]);
    }
  }
  return classes;
};
var interpolatorPiecewise = (interpolator) => (arr) => {
  let classes = get_classes(arr);
  return (t) => {
    let cls = t * classes.length;
    let idx = t >= 1 ? classes.length - 1 : Math.max(Math.floor(cls), 0);
    let pair = classes[idx];
    return pair === void 0 ? void 0 : interpolator(pair[0], pair[1], cls - idx);
  };
};

// node_modules/culori/src/interpolate/linear.js
var interpolatorLinear = interpolatorPiecewise(lerp);

// node_modules/culori/src/fixup/alpha.js
var fixupAlpha = (arr) => {
  let some_defined = false;
  let res = arr.map((v) => {
    if (v !== void 0) {
      some_defined = true;
      return v;
    }
    return 1;
  });
  return some_defined ? res : arr;
};

// node_modules/culori/src/rgb/definition.js
var definition = {
  mode: "rgb",
  channels: ["r", "g", "b", "alpha"],
  parse: [
    parseRgb_default,
    parseHex_default,
    parseRgbLegacy_default,
    parseNamed_default,
    parseTransparent_default,
    "srgb"
  ],
  serialize: "srgb",
  interpolate: {
    r: interpolatorLinear,
    g: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  gamut: true,
  white: { r: 1, g: 1, b: 1 },
  black: { r: 0, g: 0, b: 0 }
};
var definition_default = definition;

// node_modules/culori/src/a98/convertA98ToXyz65.js
var linearize = (v = 0) => Math.pow(Math.abs(v), 563 / 256) * Math.sign(v);
var convertA98ToXyz65 = (a982) => {
  let r2 = linearize(a982.r);
  let g = linearize(a982.g);
  let b = linearize(a982.b);
  let res = {
    mode: "xyz65",
    x: 0.5766690429101305 * r2 + 0.1855582379065463 * g + 0.1882286462349947 * b,
    y: 0.297344975250536 * r2 + 0.6273635662554661 * g + 0.0752914584939979 * b,
    z: 0.0270313613864123 * r2 + 0.0706888525358272 * g + 0.9913375368376386 * b
  };
  if (a982.alpha !== void 0) {
    res.alpha = a982.alpha;
  }
  return res;
};
var convertA98ToXyz65_default = convertA98ToXyz65;

// node_modules/culori/src/a98/convertXyz65ToA98.js
var gamma = (v) => Math.pow(Math.abs(v), 256 / 563) * Math.sign(v);
var convertXyz65ToA98 = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "a98",
    r: gamma(
      x * 2.0415879038107465 - y * 0.5650069742788597 - 0.3447313507783297 * z
    ),
    g: gamma(
      x * -0.9692436362808798 + y * 1.8759675015077206 + 0.0415550574071756 * z
    ),
    b: gamma(
      x * 0.0134442806320312 - y * 0.1183623922310184 + 1.0151749943912058 * z
    )
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToA98_default = convertXyz65ToA98;

// node_modules/culori/src/lrgb/convertRgbToLrgb.js
var fn = (c2 = 0) => {
  const abs2 = Math.abs(c2);
  if (abs2 <= 0.04045) {
    return c2 / 12.92;
  }
  return (Math.sign(c2) || 1) * Math.pow((abs2 + 0.055) / 1.055, 2.4);
};
var convertRgbToLrgb = ({ r: r2, g, b, alpha }) => {
  let res = {
    mode: "lrgb",
    r: fn(r2),
    g: fn(g),
    b: fn(b)
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertRgbToLrgb_default = convertRgbToLrgb;

// node_modules/culori/src/xyz65/convertRgbToXyz65.js
var convertRgbToXyz65 = (rgb3) => {
  let { r: r2, g, b, alpha } = convertRgbToLrgb_default(rgb3);
  let res = {
    mode: "xyz65",
    x: 0.4123907992659593 * r2 + 0.357584339383878 * g + 0.1804807884018343 * b,
    y: 0.2126390058715102 * r2 + 0.715168678767756 * g + 0.0721923153607337 * b,
    z: 0.0193308187155918 * r2 + 0.119194779794626 * g + 0.9505321522496607 * b
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertRgbToXyz65_default = convertRgbToXyz65;

// node_modules/culori/src/lrgb/convertLrgbToRgb.js
var fn2 = (c2 = 0) => {
  const abs2 = Math.abs(c2);
  if (abs2 > 31308e-7) {
    return (Math.sign(c2) || 1) * (1.055 * Math.pow(abs2, 1 / 2.4) - 0.055);
  }
  return c2 * 12.92;
};
var convertLrgbToRgb = ({ r: r2, g, b, alpha }, mode = "rgb") => {
  let res = {
    mode,
    r: fn2(r2),
    g: fn2(g),
    b: fn2(b)
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertLrgbToRgb_default = convertLrgbToRgb;

// node_modules/culori/src/xyz65/convertXyz65ToRgb.js
var convertXyz65ToRgb = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = convertLrgbToRgb_default({
    r: x * 3.2409699419045226 - y * 1.537383177570094 - 0.4986107602930034 * z,
    g: x * -0.9692436362808796 + y * 1.8759675015077204 + 0.0415550574071756 * z,
    b: x * 0.0556300796969936 - y * 0.2039769588889765 + 1.0569715142428784 * z
  });
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToRgb_default = convertXyz65ToRgb;

// node_modules/culori/src/a98/definition.js
var definition2 = {
  ...definition_default,
  mode: "a98",
  parse: ["a98-rgb"],
  serialize: "a98-rgb",
  fromMode: {
    rgb: (color) => convertXyz65ToA98_default(convertRgbToXyz65_default(color)),
    xyz65: convertXyz65ToA98_default
  },
  toMode: {
    rgb: (color) => convertXyz65ToRgb_default(convertA98ToXyz65_default(color)),
    xyz65: convertA98ToXyz65_default
  }
};
var definition_default2 = definition2;

// node_modules/culori/src/util/normalizeHue.js
var normalizeHue = (hue3) => (hue3 = hue3 % 360) < 0 ? hue3 + 360 : hue3;
var normalizeHue_default = normalizeHue;

// node_modules/culori/src/fixup/hue.js
var hue2 = (hues, fn5) => {
  return hues.map((hue3, idx, arr) => {
    if (hue3 === void 0) {
      return hue3;
    }
    let normalized = normalizeHue_default(hue3);
    if (idx === 0 || hues[idx - 1] === void 0) {
      return normalized;
    }
    return fn5(normalized - normalizeHue_default(arr[idx - 1]));
  }).reduce((acc, curr) => {
    if (!acc.length || curr === void 0 || acc[acc.length - 1] === void 0) {
      acc.push(curr);
      return acc;
    }
    acc.push(curr + acc[acc.length - 1]);
    return acc;
  }, []);
};
var fixupHueShorter = (arr) => hue2(arr, (d) => Math.abs(d) <= 180 ? d : d - 360 * Math.sign(d));

// node_modules/culori/src/cubehelix/constants.js
var M = [-0.14861, 1.78277, -0.29227, -0.90649, 1.97294, 0];
var degToRad = Math.PI / 180;
var radToDeg = 180 / Math.PI;

// node_modules/culori/src/cubehelix/convertRgbToCubehelix.js
var DE = M[3] * M[4];
var BE = M[1] * M[4];
var BCAD = M[1] * M[2] - M[0] * M[3];
var convertRgbToCubehelix = ({ r: r2, g, b, alpha }) => {
  if (r2 === void 0) r2 = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let l = (BCAD * b + r2 * DE - g * BE) / (BCAD + DE - BE);
  let x = b - l;
  let y = (M[4] * (g - l) - M[2] * x) / M[3];
  let res = {
    mode: "cubehelix",
    l,
    s: l === 0 || l === 1 ? void 0 : Math.sqrt(x * x + y * y) / (M[4] * l * (1 - l))
  };
  if (res.s) res.h = Math.atan2(y, x) * radToDeg - 120;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertRgbToCubehelix_default = convertRgbToCubehelix;

// node_modules/culori/src/cubehelix/convertCubehelixToRgb.js
var convertCubehelixToRgb = ({ h, s, l, alpha }) => {
  let res = { mode: "rgb" };
  h = (h === void 0 ? 0 : h + 120) * degToRad;
  if (l === void 0) l = 0;
  let amp = s === void 0 ? 0 : s * l * (1 - l);
  let cosh = Math.cos(h);
  let sinh = Math.sin(h);
  res.r = l + amp * (M[0] * cosh + M[1] * sinh);
  res.g = l + amp * (M[2] * cosh + M[3] * sinh);
  res.b = l + amp * (M[4] * cosh + M[5] * sinh);
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertCubehelixToRgb_default = convertCubehelixToRgb;

// node_modules/culori/src/difference.js
var differenceHueSaturation = (std, smp) => {
  if (std.h === void 0 || smp.h === void 0 || !std.s || !smp.s) {
    return 0;
  }
  let std_h = normalizeHue_default(std.h);
  let smp_h = normalizeHue_default(smp.h);
  let dH = Math.sin((smp_h - std_h + 360) / 2 * Math.PI / 180);
  return 2 * Math.sqrt(std.s * smp.s) * dH;
};
var differenceHueNaive = (std, smp) => {
  if (std.h === void 0 || smp.h === void 0) {
    return 0;
  }
  let std_h = normalizeHue_default(std.h);
  let smp_h = normalizeHue_default(smp.h);
  if (Math.abs(smp_h - std_h) > 180) {
    return std_h - (smp_h - 360 * Math.sign(smp_h - std_h));
  }
  return smp_h - std_h;
};
var differenceHueChroma = (std, smp) => {
  if (std.h === void 0 || smp.h === void 0 || !std.c || !smp.c) {
    return 0;
  }
  let std_h = normalizeHue_default(std.h);
  let smp_h = normalizeHue_default(smp.h);
  let dH = Math.sin((smp_h - std_h + 360) / 2 * Math.PI / 180);
  return 2 * Math.sqrt(std.c * smp.c) * dH;
};
var differenceCiede2000 = (Kl = 1, Kc = 1, Kh = 1) => {
  let lab2 = converter_default("lab65");
  return (std, smp) => {
    let LabStd = lab2(std);
    let LabSmp = lab2(smp);
    let lStd = LabStd.l;
    let aStd = LabStd.a;
    let bStd = LabStd.b;
    let cStd = Math.sqrt(aStd * aStd + bStd * bStd);
    let lSmp = LabSmp.l;
    let aSmp = LabSmp.a;
    let bSmp = LabSmp.b;
    let cSmp = Math.sqrt(aSmp * aSmp + bSmp * bSmp);
    let cAvg = (cStd + cSmp) / 2;
    let G = 0.5 * (1 - Math.sqrt(
      Math.pow(cAvg, 7) / (Math.pow(cAvg, 7) + Math.pow(25, 7))
    ));
    let apStd = aStd * (1 + G);
    let apSmp = aSmp * (1 + G);
    let cpStd = Math.sqrt(apStd * apStd + bStd * bStd);
    let cpSmp = Math.sqrt(apSmp * apSmp + bSmp * bSmp);
    let hpStd = Math.abs(apStd) + Math.abs(bStd) === 0 ? 0 : Math.atan2(bStd, apStd);
    hpStd += (hpStd < 0) * 2 * Math.PI;
    let hpSmp = Math.abs(apSmp) + Math.abs(bSmp) === 0 ? 0 : Math.atan2(bSmp, apSmp);
    hpSmp += (hpSmp < 0) * 2 * Math.PI;
    let dL = lSmp - lStd;
    let dC = cpSmp - cpStd;
    let dhp = cpStd * cpSmp === 0 ? 0 : hpSmp - hpStd;
    dhp -= (dhp > Math.PI) * 2 * Math.PI;
    dhp += (dhp < -Math.PI) * 2 * Math.PI;
    let dH = 2 * Math.sqrt(cpStd * cpSmp) * Math.sin(dhp / 2);
    let Lp = (lStd + lSmp) / 2;
    let Cp = (cpStd + cpSmp) / 2;
    let hp;
    if (cpStd * cpSmp === 0) {
      hp = hpStd + hpSmp;
    } else {
      hp = (hpStd + hpSmp) / 2;
      hp -= (Math.abs(hpStd - hpSmp) > Math.PI) * Math.PI;
      hp += (hp < 0) * 2 * Math.PI;
    }
    let Lpm50 = Math.pow(Lp - 50, 2);
    let T = 1 - 0.17 * Math.cos(hp - Math.PI / 6) + 0.24 * Math.cos(2 * hp) + 0.32 * Math.cos(3 * hp + Math.PI / 30) - 0.2 * Math.cos(4 * hp - 63 * Math.PI / 180);
    let Sl = 1 + 0.015 * Lpm50 / Math.sqrt(20 + Lpm50);
    let Sc = 1 + 0.045 * Cp;
    let Sh = 1 + 0.015 * Cp * T;
    let deltaTheta = 30 * Math.PI / 180 * Math.exp(-1 * Math.pow((180 / Math.PI * hp - 275) / 25, 2));
    let Rc = 2 * Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));
    let Rt = -1 * Math.sin(2 * deltaTheta) * Rc;
    return Math.sqrt(
      Math.pow(dL / (Kl * Sl), 2) + Math.pow(dC / (Kc * Sc), 2) + Math.pow(dH / (Kh * Sh), 2) + Rt * dC / (Kc * Sc) * dH / (Kh * Sh)
    );
  };
};

// node_modules/culori/src/average.js
var averageAngle = (val) => {
  let sum = val.reduce(
    (sum2, val2) => {
      if (val2 !== void 0) {
        let rad = val2 * Math.PI / 180;
        sum2.sin += Math.sin(rad);
        sum2.cos += Math.cos(rad);
      }
      return sum2;
    },
    { sin: 0, cos: 0 }
  );
  let angle = Math.atan2(sum.sin, sum.cos) * 180 / Math.PI;
  return angle < 0 ? 360 + angle : angle;
};

// node_modules/culori/src/cubehelix/definition.js
var definition3 = {
  mode: "cubehelix",
  channels: ["h", "s", "l", "alpha"],
  parse: ["--cubehelix"],
  serialize: "--cubehelix",
  ranges: {
    h: [0, 360],
    s: [0, 4.614],
    l: [0, 1]
  },
  fromMode: {
    rgb: convertRgbToCubehelix_default
  },
  toMode: {
    rgb: convertCubehelixToRgb_default
  },
  interpolate: {
    h: {
      use: interpolatorLinear,
      fixup: fixupHueShorter
    },
    s: interpolatorLinear,
    l: interpolatorLinear,
    alpha: {
      use: interpolatorLinear,
      fixup: fixupAlpha
    }
  },
  difference: {
    h: differenceHueSaturation
  },
  average: {
    h: averageAngle
  }
};
var definition_default3 = definition3;

// node_modules/culori/src/lch/convertLabToLch.js
var convertLabToLch = ({ l, a, b, alpha }, mode = "lch") => {
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let c2 = Math.sqrt(a * a + b * b);
  let res = { mode, l, c: c2 };
  if (c2) res.h = normalizeHue_default(Math.atan2(b, a) * 180 / Math.PI);
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertLabToLch_default = convertLabToLch;

// node_modules/culori/src/lch/convertLchToLab.js
var convertLchToLab = ({ l, c: c2, h, alpha }, mode = "lab") => {
  if (h === void 0) h = 0;
  let res = {
    mode,
    l,
    a: c2 ? c2 * Math.cos(h / 180 * Math.PI) : 0,
    b: c2 ? c2 * Math.sin(h / 180 * Math.PI) : 0
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertLchToLab_default = convertLchToLab;

// node_modules/culori/src/xyz65/constants.js
var k = Math.pow(29, 3) / Math.pow(3, 3);
var e = Math.pow(6, 3) / Math.pow(29, 3);

// node_modules/culori/src/constants.js
var D50 = {
  X: 0.3457 / 0.3585,
  Y: 1,
  Z: (1 - 0.3457 - 0.3585) / 0.3585
};
var D65 = {
  X: 0.3127 / 0.329,
  Y: 1,
  Z: (1 - 0.3127 - 0.329) / 0.329
};
var k2 = Math.pow(29, 3) / Math.pow(3, 3);
var e2 = Math.pow(6, 3) / Math.pow(29, 3);

// node_modules/culori/src/lab65/convertLab65ToXyz65.js
var fn3 = (v) => Math.pow(v, 3) > e ? Math.pow(v, 3) : (116 * v - 16) / k;
var convertLab65ToXyz65 = ({ l, a, b, alpha }) => {
  if (l === void 0) l = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let fy = (l + 16) / 116;
  let fx = a / 500 + fy;
  let fz = fy - b / 200;
  let res = {
    mode: "xyz65",
    x: fn3(fx) * D65.X,
    y: fn3(fy) * D65.Y,
    z: fn3(fz) * D65.Z
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLab65ToXyz65_default = convertLab65ToXyz65;

// node_modules/culori/src/lab65/convertLab65ToRgb.js
var convertLab65ToRgb = (lab2) => convertXyz65ToRgb_default(convertLab65ToXyz65_default(lab2));
var convertLab65ToRgb_default = convertLab65ToRgb;

// node_modules/culori/src/lab65/convertXyz65ToLab65.js
var f = (value) => value > e ? Math.cbrt(value) : (k * value + 16) / 116;
var convertXyz65ToLab65 = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let f0 = f(x / D65.X);
  let f1 = f(y / D65.Y);
  let f22 = f(z / D65.Z);
  let res = {
    mode: "lab65",
    l: 116 * f1 - 16,
    a: 500 * (f0 - f1),
    b: 200 * (f1 - f22)
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToLab65_default = convertXyz65ToLab65;

// node_modules/culori/src/lab65/convertRgbToLab65.js
var convertRgbToLab65 = (rgb3) => {
  let res = convertXyz65ToLab65_default(convertRgbToXyz65_default(rgb3));
  if (rgb3.r === rgb3.b && rgb3.b === rgb3.g) {
    res.a = res.b = 0;
  }
  return res;
};
var convertRgbToLab65_default = convertRgbToLab65;

// node_modules/culori/src/dlch/constants.js
var kE = 1;
var kCH = 1;
var \u03B8 = 26 / 180 * Math.PI;
var cos\u03B8 = Math.cos(\u03B8);
var sin\u03B8 = Math.sin(\u03B8);
var factor = 100 / Math.log(139 / 100);

// node_modules/culori/src/dlch/convertDlchToLab65.js
var convertDlchToLab65 = ({ l, c: c2, h, alpha }) => {
  if (l === void 0) l = 0;
  if (c2 === void 0) c2 = 0;
  if (h === void 0) h = 0;
  let res = {
    mode: "lab65",
    l: (Math.exp(l * kE / factor) - 1) / 39e-4
  };
  let G = (Math.exp(0.0435 * c2 * kCH * kE) - 1) / 0.075;
  let e4 = G * Math.cos(h / 180 * Math.PI - \u03B8);
  let f3 = G * Math.sin(h / 180 * Math.PI - \u03B8);
  res.a = e4 * cos\u03B8 - f3 / 0.83 * sin\u03B8;
  res.b = e4 * sin\u03B8 + f3 / 0.83 * cos\u03B8;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertDlchToLab65_default = convertDlchToLab65;

// node_modules/culori/src/dlch/convertLab65ToDlch.js
var convertLab65ToDlch = ({ l, a, b, alpha }) => {
  if (l === void 0) l = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let e4 = a * cos\u03B8 + b * sin\u03B8;
  let f3 = 0.83 * (b * cos\u03B8 - a * sin\u03B8);
  let G = Math.sqrt(e4 * e4 + f3 * f3);
  let res = {
    mode: "dlch",
    l: factor / kE * Math.log(1 + 39e-4 * l),
    c: Math.log(1 + 0.075 * G) / (0.0435 * kCH * kE)
  };
  if (res.c) {
    res.h = normalizeHue_default((Math.atan2(f3, e4) + \u03B8) / Math.PI * 180);
  }
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertLab65ToDlch_default = convertLab65ToDlch;

// node_modules/culori/src/dlab/definition.js
var convertDlabToLab65 = (c2) => convertDlchToLab65_default(convertLabToLch_default(c2, "dlch"));
var convertLab65ToDlab = (c2) => convertLchToLab_default(convertLab65ToDlch_default(c2), "dlab");
var definition4 = {
  mode: "dlab",
  parse: ["--din99o-lab"],
  serialize: "--din99o-lab",
  toMode: {
    lab65: convertDlabToLab65,
    rgb: (c2) => convertLab65ToRgb_default(convertDlabToLab65(c2))
  },
  fromMode: {
    lab65: convertLab65ToDlab,
    rgb: (c2) => convertLab65ToDlab(convertRgbToLab65_default(c2))
  },
  channels: ["l", "a", "b", "alpha"],
  ranges: {
    l: [0, 100],
    a: [-40.09, 45.501],
    b: [-40.469, 44.344]
  },
  interpolate: {
    l: interpolatorLinear,
    a: interpolatorLinear,
    b: interpolatorLinear,
    alpha: {
      use: interpolatorLinear,
      fixup: fixupAlpha
    }
  }
};
var definition_default4 = definition4;

// node_modules/culori/src/dlch/definition.js
var definition5 = {
  mode: "dlch",
  parse: ["--din99o-lch"],
  serialize: "--din99o-lch",
  toMode: {
    lab65: convertDlchToLab65_default,
    dlab: (c2) => convertLchToLab_default(c2, "dlab"),
    rgb: (c2) => convertLab65ToRgb_default(convertDlchToLab65_default(c2))
  },
  fromMode: {
    lab65: convertLab65ToDlch_default,
    dlab: (c2) => convertLabToLch_default(c2, "dlch"),
    rgb: (c2) => convertLab65ToDlch_default(convertRgbToLab65_default(c2))
  },
  channels: ["l", "c", "h", "alpha"],
  ranges: {
    l: [0, 100],
    c: [0, 51.484],
    h: [0, 360]
  },
  interpolate: {
    l: interpolatorLinear,
    c: interpolatorLinear,
    h: {
      use: interpolatorLinear,
      fixup: fixupHueShorter
    },
    alpha: {
      use: interpolatorLinear,
      fixup: fixupAlpha
    }
  },
  difference: {
    h: differenceHueChroma
  },
  average: {
    h: averageAngle
  }
};
var definition_default5 = definition5;

// node_modules/culori/src/hsi/convertHsiToRgb.js
function convertHsiToRgb({ h, s, i, alpha }) {
  h = normalizeHue_default(h !== void 0 ? h : 0);
  if (s === void 0) s = 0;
  if (i === void 0) i = 0;
  let f3 = Math.abs(h / 60 % 2 - 1);
  let res;
  switch (Math.floor(h / 60)) {
    case 0:
      res = {
        r: i * (1 + s * (3 / (2 - f3) - 1)),
        g: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1)),
        b: i * (1 - s)
      };
      break;
    case 1:
      res = {
        r: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1)),
        g: i * (1 + s * (3 / (2 - f3) - 1)),
        b: i * (1 - s)
      };
      break;
    case 2:
      res = {
        r: i * (1 - s),
        g: i * (1 + s * (3 / (2 - f3) - 1)),
        b: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1))
      };
      break;
    case 3:
      res = {
        r: i * (1 - s),
        g: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1)),
        b: i * (1 + s * (3 / (2 - f3) - 1))
      };
      break;
    case 4:
      res = {
        r: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1)),
        g: i * (1 - s),
        b: i * (1 + s * (3 / (2 - f3) - 1))
      };
      break;
    case 5:
      res = {
        r: i * (1 + s * (3 / (2 - f3) - 1)),
        g: i * (1 - s),
        b: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1))
      };
      break;
    default:
      res = { r: i * (1 - s), g: i * (1 - s), b: i * (1 - s) };
  }
  res.mode = "rgb";
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsi/convertRgbToHsi.js
function convertRgbToHsi({ r: r2, g, b, alpha }) {
  if (r2 === void 0) r2 = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let M3 = Math.max(r2, g, b), m = Math.min(r2, g, b);
  let res = {
    mode: "hsi",
    s: r2 + g + b === 0 ? 0 : 1 - 3 * m / (r2 + g + b),
    i: (r2 + g + b) / 3
  };
  if (M3 - m !== 0)
    res.h = (M3 === r2 ? (g - b) / (M3 - m) + (g < b) * 6 : M3 === g ? (b - r2) / (M3 - m) + 2 : (r2 - g) / (M3 - m) + 4) * 60;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsi/definition.js
var definition6 = {
  mode: "hsi",
  toMode: {
    rgb: convertHsiToRgb
  },
  parse: ["--hsi"],
  serialize: "--hsi",
  fromMode: {
    rgb: convertRgbToHsi
  },
  channels: ["h", "s", "i", "alpha"],
  ranges: {
    h: [0, 360]
  },
  gamut: "rgb",
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    s: interpolatorLinear,
    i: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueSaturation
  },
  average: {
    h: averageAngle
  }
};
var definition_default6 = definition6;

// node_modules/culori/src/hsl/convertHslToRgb.js
function convertHslToRgb({ h, s, l, alpha }) {
  h = normalizeHue_default(h !== void 0 ? h : 0);
  if (s === void 0) s = 0;
  if (l === void 0) l = 0;
  let m1 = l + s * (l < 0.5 ? l : 1 - l);
  let m2 = m1 - (m1 - l) * 2 * Math.abs(h / 60 % 2 - 1);
  let res;
  switch (Math.floor(h / 60)) {
    case 0:
      res = { r: m1, g: m2, b: 2 * l - m1 };
      break;
    case 1:
      res = { r: m2, g: m1, b: 2 * l - m1 };
      break;
    case 2:
      res = { r: 2 * l - m1, g: m1, b: m2 };
      break;
    case 3:
      res = { r: 2 * l - m1, g: m2, b: m1 };
      break;
    case 4:
      res = { r: m2, g: 2 * l - m1, b: m1 };
      break;
    case 5:
      res = { r: m1, g: 2 * l - m1, b: m2 };
      break;
    default:
      res = { r: 2 * l - m1, g: 2 * l - m1, b: 2 * l - m1 };
  }
  res.mode = "rgb";
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsl/convertRgbToHsl.js
function convertRgbToHsl({ r: r2, g, b, alpha }) {
  if (r2 === void 0) r2 = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let M3 = Math.max(r2, g, b), m = Math.min(r2, g, b);
  let res = {
    mode: "hsl",
    s: M3 === m ? 0 : (M3 - m) / (1 - Math.abs(M3 + m - 1)),
    l: 0.5 * (M3 + m)
  };
  if (M3 - m !== 0)
    res.h = (M3 === r2 ? (g - b) / (M3 - m) + (g < b) * 6 : M3 === g ? (b - r2) / (M3 - m) + 2 : (r2 - g) / (M3 - m) + 4) * 60;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/util/hue.js
var hueToDeg = (val, unit) => {
  switch (unit) {
    case "deg":
      return +val;
    case "rad":
      return val / Math.PI * 180;
    case "grad":
      return val / 10 * 9;
    case "turn":
      return val * 360;
  }
};
var hue_default = hueToDeg;

// node_modules/culori/src/hsl/parseHslLegacy.js
var hsl_old = new RegExp(
  `^hsla?\\(\\s*${hue}${c}${per}${c}${per}\\s*(?:,\\s*${num_per}\\s*)?\\)$`
);
var parseHslLegacy = (color) => {
  let match = color.match(hsl_old);
  if (!match) return;
  let res = { mode: "hsl" };
  if (match[3] !== void 0) {
    res.h = +match[3];
  } else if (match[1] !== void 0 && match[2] !== void 0) {
    res.h = hue_default(match[1], match[2]);
  }
  if (match[4] !== void 0) {
    res.s = Math.min(Math.max(0, match[4] / 100), 1);
  }
  if (match[5] !== void 0) {
    res.l = Math.min(Math.max(0, match[5] / 100), 1);
  }
  if (match[6] !== void 0) {
    res.alpha = Math.max(0, Math.min(1, match[6] / 100));
  } else if (match[7] !== void 0) {
    res.alpha = Math.max(0, Math.min(1, +match[7]));
  }
  return res;
};
var parseHslLegacy_default = parseHslLegacy;

// node_modules/culori/src/hsl/parseHsl.js
function parseHsl(color, parsed) {
  if (!parsed || parsed[0] !== "hsl" && parsed[0] !== "hsla") {
    return void 0;
  }
  const res = { mode: "hsl" };
  const [, h, s, l, alpha] = parsed;
  if (h.type !== Tok.None) {
    if (h.type === Tok.Percentage) {
      return void 0;
    }
    res.h = h.value;
  }
  if (s.type !== Tok.None) {
    if (s.type === Tok.Hue) {
      return void 0;
    }
    res.s = s.value / 100;
  }
  if (l.type !== Tok.None) {
    if (l.type === Tok.Hue) {
      return void 0;
    }
    res.l = l.value / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseHsl_default = parseHsl;

// node_modules/culori/src/hsl/definition.js
var definition7 = {
  mode: "hsl",
  toMode: {
    rgb: convertHslToRgb
  },
  fromMode: {
    rgb: convertRgbToHsl
  },
  channels: ["h", "s", "l", "alpha"],
  ranges: {
    h: [0, 360]
  },
  gamut: "rgb",
  parse: [parseHsl_default, parseHslLegacy_default],
  serialize: (c2) => `hsl(${c2.h !== void 0 ? c2.h : "none"} ${c2.s !== void 0 ? c2.s * 100 + "%" : "none"} ${c2.l !== void 0 ? c2.l * 100 + "%" : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    s: interpolatorLinear,
    l: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueSaturation
  },
  average: {
    h: averageAngle
  }
};
var definition_default7 = definition7;

// node_modules/culori/src/hsv/convertHsvToRgb.js
function convertHsvToRgb({ h, s, v, alpha }) {
  h = normalizeHue_default(h !== void 0 ? h : 0);
  if (s === void 0) s = 0;
  if (v === void 0) v = 0;
  let f3 = Math.abs(h / 60 % 2 - 1);
  let res;
  switch (Math.floor(h / 60)) {
    case 0:
      res = { r: v, g: v * (1 - s * f3), b: v * (1 - s) };
      break;
    case 1:
      res = { r: v * (1 - s * f3), g: v, b: v * (1 - s) };
      break;
    case 2:
      res = { r: v * (1 - s), g: v, b: v * (1 - s * f3) };
      break;
    case 3:
      res = { r: v * (1 - s), g: v * (1 - s * f3), b: v };
      break;
    case 4:
      res = { r: v * (1 - s * f3), g: v * (1 - s), b: v };
      break;
    case 5:
      res = { r: v, g: v * (1 - s), b: v * (1 - s * f3) };
      break;
    default:
      res = { r: v * (1 - s), g: v * (1 - s), b: v * (1 - s) };
  }
  res.mode = "rgb";
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsv/convertRgbToHsv.js
function convertRgbToHsv({ r: r2, g, b, alpha }) {
  if (r2 === void 0) r2 = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let M3 = Math.max(r2, g, b), m = Math.min(r2, g, b);
  let res = {
    mode: "hsv",
    s: M3 === 0 ? 0 : 1 - m / M3,
    v: M3
  };
  if (M3 - m !== 0)
    res.h = (M3 === r2 ? (g - b) / (M3 - m) + (g < b) * 6 : M3 === g ? (b - r2) / (M3 - m) + 2 : (r2 - g) / (M3 - m) + 4) * 60;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsv/definition.js
var definition8 = {
  mode: "hsv",
  toMode: {
    rgb: convertHsvToRgb
  },
  parse: ["--hsv"],
  serialize: "--hsv",
  fromMode: {
    rgb: convertRgbToHsv
  },
  channels: ["h", "s", "v", "alpha"],
  ranges: {
    h: [0, 360]
  },
  gamut: "rgb",
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    s: interpolatorLinear,
    v: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueSaturation
  },
  average: {
    h: averageAngle
  }
};
var definition_default8 = definition8;

// node_modules/culori/src/hwb/convertHwbToRgb.js
function convertHwbToRgb({ h, w, b, alpha }) {
  if (w === void 0) w = 0;
  if (b === void 0) b = 0;
  if (w + b > 1) {
    let s = w + b;
    w /= s;
    b /= s;
  }
  return convertHsvToRgb({
    h,
    s: b === 1 ? 1 : 1 - w / (1 - b),
    v: 1 - b,
    alpha
  });
}

// node_modules/culori/src/hwb/convertRgbToHwb.js
function convertRgbToHwb(rgba) {
  let hsv2 = convertRgbToHsv(rgba);
  if (hsv2 === void 0) return void 0;
  let s = hsv2.s !== void 0 ? hsv2.s : 0;
  let v = hsv2.v !== void 0 ? hsv2.v : 0;
  let res = {
    mode: "hwb",
    w: (1 - s) * v,
    b: 1 - v
  };
  if (hsv2.h !== void 0) res.h = hsv2.h;
  if (hsv2.alpha !== void 0) res.alpha = hsv2.alpha;
  return res;
}

// node_modules/culori/src/hwb/parseHwb.js
function ParseHwb(color, parsed) {
  if (!parsed || parsed[0] !== "hwb") {
    return void 0;
  }
  const res = { mode: "hwb" };
  const [, h, w, b, alpha] = parsed;
  if (h.type !== Tok.None) {
    if (h.type === Tok.Percentage) {
      return void 0;
    }
    res.h = h.value;
  }
  if (w.type !== Tok.None) {
    if (w.type === Tok.Hue) {
      return void 0;
    }
    res.w = w.value / 100;
  }
  if (b.type !== Tok.None) {
    if (b.type === Tok.Hue) {
      return void 0;
    }
    res.b = b.value / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseHwb_default = ParseHwb;

// node_modules/culori/src/hwb/definition.js
var definition9 = {
  mode: "hwb",
  toMode: {
    rgb: convertHwbToRgb
  },
  fromMode: {
    rgb: convertRgbToHwb
  },
  channels: ["h", "w", "b", "alpha"],
  ranges: {
    h: [0, 360]
  },
  gamut: "rgb",
  parse: [parseHwb_default],
  serialize: (c2) => `hwb(${c2.h !== void 0 ? c2.h : "none"} ${c2.w !== void 0 ? c2.w * 100 + "%" : "none"} ${c2.b !== void 0 ? c2.b * 100 + "%" : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    w: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueNaive
  },
  average: {
    h: averageAngle
  }
};
var definition_default9 = definition9;

// node_modules/culori/src/hdr/constants.js
var YW = 203;

// node_modules/culori/src/hdr/transfer.js
var M1 = 0.1593017578125;
var M2 = 78.84375;
var C1 = 0.8359375;
var C2 = 18.8515625;
var C3 = 18.6875;
function transferPqDecode(v) {
  if (v < 0) return 0;
  const c2 = Math.pow(v, 1 / M2);
  return 1e4 * Math.pow(Math.max(0, c2 - C1) / (C2 - C3 * c2), 1 / M1);
}
function transferPqEncode(v) {
  if (v < 0) return 0;
  const c2 = Math.pow(v / 1e4, M1);
  return Math.pow((C1 + C2 * c2) / (1 + C3 * c2), M2);
}

// node_modules/culori/src/itp/convertItpToXyz65.js
var toRel = (c2) => Math.max(c2 / YW, 0);
var convertItpToXyz65 = ({ i, t, p: p4, alpha }) => {
  if (i === void 0) i = 0;
  if (t === void 0) t = 0;
  if (p4 === void 0) p4 = 0;
  const l = transferPqDecode(
    i + 0.008609037037932761 * t + 0.11102962500302593 * p4
  );
  const m = transferPqDecode(
    i - 0.00860903703793275 * t - 0.11102962500302599 * p4
  );
  const s = transferPqDecode(
    i + 0.5600313357106791 * t - 0.32062717498731885 * p4
  );
  const res = {
    mode: "xyz65",
    x: toRel(
      2.070152218389422 * l - 1.3263473389671556 * m + 0.2066510476294051 * s
    ),
    y: toRel(
      0.3647385209748074 * l + 0.680566024947227 * m - 0.0453045459220346 * s
    ),
    z: toRel(
      -0.049747207535812 * l - 0.0492609666966138 * m + 1.1880659249923042 * s
    )
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertItpToXyz65_default = convertItpToXyz65;

// node_modules/culori/src/itp/convertXyz65ToItp.js
var toAbs = (c2 = 0) => Math.max(c2 * YW, 0);
var convertXyz65ToItp = ({ x, y, z, alpha }) => {
  const absX = toAbs(x);
  const absY = toAbs(y);
  const absZ = toAbs(z);
  const l = transferPqEncode(
    0.3592832590121217 * absX + 0.6976051147779502 * absY - 0.0358915932320289 * absZ
  );
  const m = transferPqEncode(
    -0.1920808463704995 * absX + 1.1004767970374323 * absY + 0.0753748658519118 * absZ
  );
  const s = transferPqEncode(
    0.0070797844607477 * absX + 0.0748396662186366 * absY + 0.8433265453898765 * absZ
  );
  const i = 0.5 * l + 0.5 * m;
  const t = 1.61376953125 * l - 3.323486328125 * m + 1.709716796875 * s;
  const p4 = 4.378173828125 * l - 4.24560546875 * m - 0.132568359375 * s;
  const res = { mode: "itp", i, t, p: p4 };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToItp_default = convertXyz65ToItp;

// node_modules/culori/src/itp/definition.js
var definition10 = {
  mode: "itp",
  channels: ["i", "t", "p", "alpha"],
  parse: ["--ictcp"],
  serialize: "--ictcp",
  toMode: {
    xyz65: convertItpToXyz65_default,
    rgb: (color) => convertXyz65ToRgb_default(convertItpToXyz65_default(color))
  },
  fromMode: {
    xyz65: convertXyz65ToItp_default,
    rgb: (color) => convertXyz65ToItp_default(convertRgbToXyz65_default(color))
  },
  ranges: {
    i: [0, 0.581],
    t: [-0.369, 0.272],
    p: [-0.164, 0.331]
  },
  interpolate: {
    i: interpolatorLinear,
    t: interpolatorLinear,
    p: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default10 = definition10;

// node_modules/culori/src/jab/convertXyz65ToJab.js
var p = 134.03437499999998;
var d0 = 16295499532821565e-27;
var jabPqEncode = (v) => {
  if (v < 0) return 0;
  let vn3 = Math.pow(v / 1e4, M1);
  return Math.pow((C1 + C2 * vn3) / (1 + C3 * vn3), p);
};
var abs = (v = 0) => Math.max(v * 203, 0);
var convertXyz65ToJab = ({ x, y, z, alpha }) => {
  x = abs(x);
  y = abs(y);
  z = abs(z);
  let xp = 1.15 * x - 0.15 * z;
  let yp = 0.66 * y + 0.34 * x;
  let l = jabPqEncode(0.41478972 * xp + 0.579999 * yp + 0.014648 * z);
  let m = jabPqEncode(-0.20151 * xp + 1.120649 * yp + 0.0531008 * z);
  let s = jabPqEncode(-0.0166008 * xp + 0.2648 * yp + 0.6684799 * z);
  let i = (l + m) / 2;
  let res = {
    mode: "jab",
    j: 0.44 * i / (1 - 0.56 * i) - d0,
    a: 3.524 * l - 4.066708 * m + 0.542708 * s,
    b: 0.199076 * l + 1.096799 * m - 1.295875 * s
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToJab_default = convertXyz65ToJab;

// node_modules/culori/src/jab/convertJabToXyz65.js
var p2 = 134.03437499999998;
var d02 = 16295499532821565e-27;
var jabPqDecode = (v) => {
  if (v < 0) return 0;
  let vp = Math.pow(v, 1 / p2);
  return 1e4 * Math.pow((C1 - vp) / (C3 * vp - C2), 1 / M1);
};
var rel = (v) => v / 203;
var convertJabToXyz65 = ({ j, a, b, alpha }) => {
  if (j === void 0) j = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let i = (j + d02) / (0.44 + 0.56 * (j + d02));
  let l = jabPqDecode(i + 0.13860504 * a + 0.058047316 * b);
  let m = jabPqDecode(i - 0.13860504 * a - 0.058047316 * b);
  let s = jabPqDecode(i - 0.096019242 * a - 0.8118919 * b);
  let res = {
    mode: "xyz65",
    x: rel(
      1.661373024652174 * l - 0.914523081304348 * m + 0.23136208173913045 * s
    ),
    y: rel(
      -0.3250758611844533 * l + 1.571847026732543 * m - 0.21825383453227928 * s
    ),
    z: rel(-0.090982811 * l - 0.31272829 * m + 1.5227666 * s)
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertJabToXyz65_default = convertJabToXyz65;

// node_modules/culori/src/jab/convertRgbToJab.js
var convertRgbToJab = (rgb3) => {
  let res = convertXyz65ToJab_default(convertRgbToXyz65_default(rgb3));
  if (rgb3.r === rgb3.b && rgb3.b === rgb3.g) {
    res.a = res.b = 0;
  }
  return res;
};
var convertRgbToJab_default = convertRgbToJab;

// node_modules/culori/src/jab/convertJabToRgb.js
var convertJabToRgb = (color) => convertXyz65ToRgb_default(convertJabToXyz65_default(color));
var convertJabToRgb_default = convertJabToRgb;

// node_modules/culori/src/jab/definition.js
var definition11 = {
  mode: "jab",
  channels: ["j", "a", "b", "alpha"],
  parse: ["--jzazbz"],
  serialize: "--jzazbz",
  fromMode: {
    rgb: convertRgbToJab_default,
    xyz65: convertXyz65ToJab_default
  },
  toMode: {
    rgb: convertJabToRgb_default,
    xyz65: convertJabToXyz65_default
  },
  ranges: {
    j: [0, 0.222],
    a: [-0.109, 0.129],
    b: [-0.185, 0.134]
  },
  interpolate: {
    j: interpolatorLinear,
    a: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default11 = definition11;

// node_modules/culori/src/jch/convertJabToJch.js
var convertJabToJch = ({ j, a, b, alpha }) => {
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let c2 = Math.sqrt(a * a + b * b);
  let res = {
    mode: "jch",
    j,
    c: c2
  };
  if (c2) {
    res.h = normalizeHue_default(Math.atan2(b, a) * 180 / Math.PI);
  }
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertJabToJch_default = convertJabToJch;

// node_modules/culori/src/jch/convertJchToJab.js
var convertJchToJab = ({ j, c: c2, h, alpha }) => {
  if (h === void 0) h = 0;
  let res = {
    mode: "jab",
    j,
    a: c2 ? c2 * Math.cos(h / 180 * Math.PI) : 0,
    b: c2 ? c2 * Math.sin(h / 180 * Math.PI) : 0
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertJchToJab_default = convertJchToJab;

// node_modules/culori/src/jch/definition.js
var definition12 = {
  mode: "jch",
  parse: ["--jzczhz"],
  serialize: "--jzczhz",
  toMode: {
    jab: convertJchToJab_default,
    rgb: (c2) => convertJabToRgb_default(convertJchToJab_default(c2))
  },
  fromMode: {
    rgb: (c2) => convertJabToJch_default(convertRgbToJab_default(c2)),
    jab: convertJabToJch_default
  },
  channels: ["j", "c", "h", "alpha"],
  ranges: {
    j: [0, 0.221],
    c: [0, 0.19],
    h: [0, 360]
  },
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    c: interpolatorLinear,
    j: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueChroma
  },
  average: {
    h: averageAngle
  }
};
var definition_default12 = definition12;

// node_modules/culori/src/xyz50/constants.js
var k3 = Math.pow(29, 3) / Math.pow(3, 3);
var e3 = Math.pow(6, 3) / Math.pow(29, 3);

// node_modules/culori/src/lab/convertLabToXyz50.js
var fn4 = (v) => Math.pow(v, 3) > e3 ? Math.pow(v, 3) : (116 * v - 16) / k3;
var convertLabToXyz50 = ({ l, a, b, alpha }) => {
  if (l === void 0) l = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let fy = (l + 16) / 116;
  let fx = a / 500 + fy;
  let fz = fy - b / 200;
  let res = {
    mode: "xyz50",
    x: fn4(fx) * D50.X,
    y: fn4(fy) * D50.Y,
    z: fn4(fz) * D50.Z
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLabToXyz50_default = convertLabToXyz50;

// node_modules/culori/src/xyz50/convertXyz50ToRgb.js
var convertXyz50ToRgb = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = convertLrgbToRgb_default({
    r: x * 3.1341359569958707 - y * 1.6173863321612538 - 0.4906619460083532 * z,
    g: x * -0.978795502912089 + y * 1.916254567259524 + 0.03344273116131949 * z,
    b: x * 0.07195537988411677 - y * 0.2289768264158322 + 1.405386058324125 * z
  });
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToRgb_default = convertXyz50ToRgb;

// node_modules/culori/src/lab/convertLabToRgb.js
var convertLabToRgb = (lab2) => convertXyz50ToRgb_default(convertLabToXyz50_default(lab2));
var convertLabToRgb_default = convertLabToRgb;

// node_modules/culori/src/xyz50/convertRgbToXyz50.js
var convertRgbToXyz50 = (rgb3) => {
  let { r: r2, g, b, alpha } = convertRgbToLrgb_default(rgb3);
  let res = {
    mode: "xyz50",
    x: 0.436065742824811 * r2 + 0.3851514688337912 * g + 0.14307845442264197 * b,
    y: 0.22249319175623702 * r2 + 0.7168870538238823 * g + 0.06061979053616537 * b,
    z: 0.013923904500943465 * r2 + 0.09708128566574634 * g + 0.7140993584005155 * b
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertRgbToXyz50_default = convertRgbToXyz50;

// node_modules/culori/src/lab/convertXyz50ToLab.js
var f2 = (value) => value > e3 ? Math.cbrt(value) : (k3 * value + 16) / 116;
var convertXyz50ToLab = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let f0 = f2(x / D50.X);
  let f1 = f2(y / D50.Y);
  let f22 = f2(z / D50.Z);
  let res = {
    mode: "lab",
    l: 116 * f1 - 16,
    a: 500 * (f0 - f1),
    b: 200 * (f1 - f22)
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToLab_default = convertXyz50ToLab;

// node_modules/culori/src/lab/convertRgbToLab.js
var convertRgbToLab = (rgb3) => {
  let res = convertXyz50ToLab_default(convertRgbToXyz50_default(rgb3));
  if (rgb3.r === rgb3.b && rgb3.b === rgb3.g) {
    res.a = res.b = 0;
  }
  return res;
};
var convertRgbToLab_default = convertRgbToLab;

// node_modules/culori/src/lab/parseLab.js
function parseLab(color, parsed) {
  if (!parsed || parsed[0] !== "lab") {
    return void 0;
  }
  const res = { mode: "lab" };
  const [, l, a, b, alpha] = parsed;
  if (l.type === Tok.Hue || a.type === Tok.Hue || b.type === Tok.Hue) {
    return void 0;
  }
  if (l.type !== Tok.None) {
    res.l = Math.min(Math.max(0, l.value), 100);
  }
  if (a.type !== Tok.None) {
    res.a = a.type === Tok.Number ? a.value : a.value * 125 / 100;
  }
  if (b.type !== Tok.None) {
    res.b = b.type === Tok.Number ? b.value : b.value * 125 / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseLab_default = parseLab;

// node_modules/culori/src/lab/definition.js
var definition13 = {
  mode: "lab",
  toMode: {
    xyz50: convertLabToXyz50_default,
    rgb: convertLabToRgb_default
  },
  fromMode: {
    xyz50: convertXyz50ToLab_default,
    rgb: convertRgbToLab_default
  },
  channels: ["l", "a", "b", "alpha"],
  ranges: {
    l: [0, 100],
    a: [-125, 125],
    b: [-125, 125]
  },
  parse: [parseLab_default],
  serialize: (c2) => `lab(${c2.l !== void 0 ? c2.l : "none"} ${c2.a !== void 0 ? c2.a : "none"} ${c2.b !== void 0 ? c2.b : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  interpolate: {
    l: interpolatorLinear,
    a: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default13 = definition13;

// node_modules/culori/src/lab65/definition.js
var definition14 = {
  ...definition_default13,
  mode: "lab65",
  parse: ["--lab-d65"],
  serialize: "--lab-d65",
  toMode: {
    xyz65: convertLab65ToXyz65_default,
    rgb: convertLab65ToRgb_default
  },
  fromMode: {
    xyz65: convertXyz65ToLab65_default,
    rgb: convertRgbToLab65_default
  },
  ranges: {
    l: [0, 100],
    a: [-125, 125],
    b: [-125, 125]
  }
};
var definition_default14 = definition14;

// node_modules/culori/src/lch/parseLch.js
function parseLch(color, parsed) {
  if (!parsed || parsed[0] !== "lch") {
    return void 0;
  }
  const res = { mode: "lch" };
  const [, l, c2, h, alpha] = parsed;
  if (l.type !== Tok.None) {
    if (l.type === Tok.Hue) {
      return void 0;
    }
    res.l = Math.min(Math.max(0, l.value), 100);
  }
  if (c2.type !== Tok.None) {
    res.c = Math.max(
      0,
      c2.type === Tok.Number ? c2.value : c2.value * 150 / 100
    );
  }
  if (h.type !== Tok.None) {
    if (h.type === Tok.Percentage) {
      return void 0;
    }
    res.h = h.value;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseLch_default = parseLch;

// node_modules/culori/src/lch/definition.js
var definition15 = {
  mode: "lch",
  toMode: {
    lab: convertLchToLab_default,
    rgb: (c2) => convertLabToRgb_default(convertLchToLab_default(c2))
  },
  fromMode: {
    rgb: (c2) => convertLabToLch_default(convertRgbToLab_default(c2)),
    lab: convertLabToLch_default
  },
  channels: ["l", "c", "h", "alpha"],
  ranges: {
    l: [0, 100],
    c: [0, 150],
    h: [0, 360]
  },
  parse: [parseLch_default],
  serialize: (c2) => `lch(${c2.l !== void 0 ? c2.l : "none"} ${c2.c !== void 0 ? c2.c : "none"} ${c2.h !== void 0 ? c2.h : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    c: interpolatorLinear,
    l: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueChroma
  },
  average: {
    h: averageAngle
  }
};
var definition_default15 = definition15;

// node_modules/culori/src/lch65/definition.js
var definition16 = {
  ...definition_default15,
  mode: "lch65",
  parse: ["--lch-d65"],
  serialize: "--lch-d65",
  toMode: {
    lab65: (c2) => convertLchToLab_default(c2, "lab65"),
    rgb: (c2) => convertLab65ToRgb_default(convertLchToLab_default(c2, "lab65"))
  },
  fromMode: {
    rgb: (c2) => convertLabToLch_default(convertRgbToLab65_default(c2), "lch65"),
    lab65: (c2) => convertLabToLch_default(c2, "lch65")
  },
  ranges: {
    l: [0, 100],
    c: [0, 150],
    h: [0, 360]
  }
};
var definition_default16 = definition16;

// node_modules/culori/src/lchuv/convertLuvToLchuv.js
var convertLuvToLchuv = ({ l, u, v, alpha }) => {
  if (u === void 0) u = 0;
  if (v === void 0) v = 0;
  let c2 = Math.sqrt(u * u + v * v);
  let res = {
    mode: "lchuv",
    l,
    c: c2
  };
  if (c2) {
    res.h = normalizeHue_default(Math.atan2(v, u) * 180 / Math.PI);
  }
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLuvToLchuv_default = convertLuvToLchuv;

// node_modules/culori/src/lchuv/convertLchuvToLuv.js
var convertLchuvToLuv = ({ l, c: c2, h, alpha }) => {
  if (h === void 0) h = 0;
  let res = {
    mode: "luv",
    l,
    u: c2 ? c2 * Math.cos(h / 180 * Math.PI) : 0,
    v: c2 ? c2 * Math.sin(h / 180 * Math.PI) : 0
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLchuvToLuv_default = convertLchuvToLuv;

// node_modules/culori/src/luv/convertXyz50ToLuv.js
var u_fn = (x, y, z) => 4 * x / (x + 15 * y + 3 * z);
var v_fn = (x, y, z) => 9 * y / (x + 15 * y + 3 * z);
var un = u_fn(D50.X, D50.Y, D50.Z);
var vn = v_fn(D50.X, D50.Y, D50.Z);
var l_fn = (value) => value <= e3 ? k3 * value : 116 * Math.cbrt(value) - 16;
var convertXyz50ToLuv = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let l = l_fn(y / D50.Y);
  let u = u_fn(x, y, z);
  let v = v_fn(x, y, z);
  if (!isFinite(u) || !isFinite(v)) {
    l = u = v = 0;
  } else {
    u = 13 * l * (u - un);
    v = 13 * l * (v - vn);
  }
  let res = {
    mode: "luv",
    l,
    u,
    v
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToLuv_default = convertXyz50ToLuv;

// node_modules/culori/src/luv/convertLuvToXyz50.js
var u_fn2 = (x, y, z) => 4 * x / (x + 15 * y + 3 * z);
var v_fn2 = (x, y, z) => 9 * y / (x + 15 * y + 3 * z);
var un2 = u_fn2(D50.X, D50.Y, D50.Z);
var vn2 = v_fn2(D50.X, D50.Y, D50.Z);
var convertLuvToXyz50 = ({ l, u, v, alpha }) => {
  if (l === void 0) l = 0;
  if (l === 0) {
    return { mode: "xyz50", x: 0, y: 0, z: 0 };
  }
  if (u === void 0) u = 0;
  if (v === void 0) v = 0;
  let up = u / (13 * l) + un2;
  let vp = v / (13 * l) + vn2;
  let y = D50.Y * (l <= 8 ? l / k3 : Math.pow((l + 16) / 116, 3));
  let x = y * (9 * up) / (4 * vp);
  let z = y * (12 - 3 * up - 20 * vp) / (4 * vp);
  let res = { mode: "xyz50", x, y, z };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLuvToXyz50_default = convertLuvToXyz50;

// node_modules/culori/src/lchuv/definition.js
var convertRgbToLchuv = (rgb3) => convertLuvToLchuv_default(convertXyz50ToLuv_default(convertRgbToXyz50_default(rgb3)));
var convertLchuvToRgb = (lchuv2) => convertXyz50ToRgb_default(convertLuvToXyz50_default(convertLchuvToLuv_default(lchuv2)));
var definition17 = {
  mode: "lchuv",
  toMode: {
    luv: convertLchuvToLuv_default,
    rgb: convertLchuvToRgb
  },
  fromMode: {
    rgb: convertRgbToLchuv,
    luv: convertLuvToLchuv_default
  },
  channels: ["l", "c", "h", "alpha"],
  parse: ["--lchuv"],
  serialize: "--lchuv",
  ranges: {
    l: [0, 100],
    c: [0, 176.956],
    h: [0, 360]
  },
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    c: interpolatorLinear,
    l: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueChroma
  },
  average: {
    h: averageAngle
  }
};
var definition_default17 = definition17;

// node_modules/culori/src/lrgb/definition.js
var definition18 = {
  ...definition_default,
  mode: "lrgb",
  toMode: {
    rgb: convertLrgbToRgb_default
  },
  fromMode: {
    rgb: convertRgbToLrgb_default
  },
  parse: ["srgb-linear"],
  serialize: "srgb-linear"
};
var definition_default18 = definition18;

// node_modules/culori/src/luv/definition.js
var definition19 = {
  mode: "luv",
  toMode: {
    xyz50: convertLuvToXyz50_default,
    rgb: (luv2) => convertXyz50ToRgb_default(convertLuvToXyz50_default(luv2))
  },
  fromMode: {
    xyz50: convertXyz50ToLuv_default,
    rgb: (rgb3) => convertXyz50ToLuv_default(convertRgbToXyz50_default(rgb3))
  },
  channels: ["l", "u", "v", "alpha"],
  parse: ["--luv"],
  serialize: "--luv",
  ranges: {
    l: [0, 100],
    u: [-84.936, 175.042],
    v: [-125.882, 87.243]
  },
  interpolate: {
    l: interpolatorLinear,
    u: interpolatorLinear,
    v: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default19 = definition19;

// node_modules/culori/src/oklab/convertLrgbToOklab.js
var convertLrgbToOklab = ({ r: r2, g, b, alpha }) => {
  if (r2 === void 0) r2 = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let L = Math.cbrt(
    0.412221469470763 * r2 + 0.5363325372617348 * g + 0.0514459932675022 * b
  );
  let M3 = Math.cbrt(
    0.2119034958178252 * r2 + 0.6806995506452344 * g + 0.1073969535369406 * b
  );
  let S = Math.cbrt(
    0.0883024591900564 * r2 + 0.2817188391361215 * g + 0.6299787016738222 * b
  );
  let res = {
    mode: "oklab",
    l: 0.210454268309314 * L + 0.7936177747023054 * M3 - 0.0040720430116193 * S,
    a: 1.9779985324311684 * L - 2.42859224204858 * M3 + 0.450593709617411 * S,
    b: 0.0259040424655478 * L + 0.7827717124575296 * M3 - 0.8086757549230774 * S
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLrgbToOklab_default = convertLrgbToOklab;

// node_modules/culori/src/oklab/convertRgbToOklab.js
var convertRgbToOklab = (rgb3) => {
  let res = convertLrgbToOklab_default(convertRgbToLrgb_default(rgb3));
  if (rgb3.r === rgb3.b && rgb3.b === rgb3.g) {
    res.a = res.b = 0;
  }
  return res;
};
var convertRgbToOklab_default = convertRgbToOklab;

// node_modules/culori/src/oklab/convertOklabToLrgb.js
var convertOklabToLrgb = ({ l, a, b, alpha }) => {
  if (l === void 0) l = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let L = Math.pow(l + 0.3963377773761749 * a + 0.2158037573099136 * b, 3);
  let M3 = Math.pow(l - 0.1055613458156586 * a - 0.0638541728258133 * b, 3);
  let S = Math.pow(l - 0.0894841775298119 * a - 1.2914855480194092 * b, 3);
  let res = {
    mode: "lrgb",
    r: 4.076741636075957 * L - 3.3077115392580616 * M3 + 0.2309699031821044 * S,
    g: -1.2684379732850317 * L + 2.6097573492876887 * M3 - 0.3413193760026573 * S,
    b: -0.0041960761386756 * L - 0.7034186179359362 * M3 + 1.7076146940746117 * S
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertOklabToLrgb_default = convertOklabToLrgb;

// node_modules/culori/src/oklab/convertOklabToRgb.js
var convertOklabToRgb = (c2) => convertLrgbToRgb_default(convertOklabToLrgb_default(c2));
var convertOklabToRgb_default = convertOklabToRgb;

// node_modules/culori/src/okhsl/helpers.js
function toe(x) {
  const k_1 = 0.206;
  const k_2 = 0.03;
  const k_3 = (1 + k_1) / (1 + k_2);
  return 0.5 * (k_3 * x - k_1 + Math.sqrt((k_3 * x - k_1) * (k_3 * x - k_1) + 4 * k_2 * k_3 * x));
}
function toe_inv(x) {
  const k_1 = 0.206;
  const k_2 = 0.03;
  const k_3 = (1 + k_1) / (1 + k_2);
  return (x * x + k_1 * x) / (k_3 * (x + k_2));
}
function compute_max_saturation(a, b) {
  let k0, k1, k22, k32, k4, wl, wm, ws;
  if (-1.88170328 * a - 0.80936493 * b > 1) {
    k0 = 1.19086277;
    k1 = 1.76576728;
    k22 = 0.59662641;
    k32 = 0.75515197;
    k4 = 0.56771245;
    wl = 4.0767416621;
    wm = -3.3077115913;
    ws = 0.2309699292;
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    k0 = 0.73956515;
    k1 = -0.45954404;
    k22 = 0.08285427;
    k32 = 0.1254107;
    k4 = 0.14503204;
    wl = -1.2684380046;
    wm = 2.6097574011;
    ws = -0.3413193965;
  } else {
    k0 = 1.35733652;
    k1 = -915799e-8;
    k22 = -1.1513021;
    k32 = -0.50559606;
    k4 = 692167e-8;
    wl = -0.0041960863;
    wm = -0.7034186147;
    ws = 1.707614701;
  }
  let S = k0 + k1 * a + k22 * b + k32 * a * a + k4 * a * b;
  let k_l = 0.3963377774 * a + 0.2158037573 * b;
  let k_m = -0.1055613458 * a - 0.0638541728 * b;
  let k_s = -0.0894841775 * a - 1.291485548 * b;
  {
    let l_ = 1 + S * k_l;
    let m_ = 1 + S * k_m;
    let s_ = 1 + S * k_s;
    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;
    let l_dS = 3 * k_l * l_ * l_;
    let m_dS = 3 * k_m * m_ * m_;
    let s_dS = 3 * k_s * s_ * s_;
    let l_dS2 = 6 * k_l * k_l * l_;
    let m_dS2 = 6 * k_m * k_m * m_;
    let s_dS2 = 6 * k_s * k_s * s_;
    let f3 = wl * l + wm * m + ws * s;
    let f1 = wl * l_dS + wm * m_dS + ws * s_dS;
    let f22 = wl * l_dS2 + wm * m_dS2 + ws * s_dS2;
    S = S - f3 * f1 / (f1 * f1 - 0.5 * f3 * f22);
  }
  return S;
}
function find_cusp(a, b) {
  let S_cusp = compute_max_saturation(a, b);
  let rgb3 = convertOklabToLrgb_default({ l: 1, a: S_cusp * a, b: S_cusp * b });
  let L_cusp = Math.cbrt(1 / Math.max(rgb3.r, rgb3.g, rgb3.b));
  let C_cusp = L_cusp * S_cusp;
  return [L_cusp, C_cusp];
}
function find_gamut_intersection(a, b, L1, C12, L0, cusp = null) {
  if (!cusp) {
    cusp = find_cusp(a, b);
  }
  let t;
  if ((L1 - L0) * cusp[1] - (cusp[0] - L0) * C12 <= 0) {
    t = cusp[1] * L0 / (C12 * cusp[0] + cusp[1] * (L0 - L1));
  } else {
    t = cusp[1] * (L0 - 1) / (C12 * (cusp[0] - 1) + cusp[1] * (L0 - L1));
    {
      let dL = L1 - L0;
      let dC = C12;
      let k_l = 0.3963377774 * a + 0.2158037573 * b;
      let k_m = -0.1055613458 * a - 0.0638541728 * b;
      let k_s = -0.0894841775 * a - 1.291485548 * b;
      let l_dt = dL + dC * k_l;
      let m_dt = dL + dC * k_m;
      let s_dt = dL + dC * k_s;
      {
        let L = L0 * (1 - t) + t * L1;
        let C = t * C12;
        let l_ = L + C * k_l;
        let m_ = L + C * k_m;
        let s_ = L + C * k_s;
        let l = l_ * l_ * l_;
        let m = m_ * m_ * m_;
        let s = s_ * s_ * s_;
        let ldt = 3 * l_dt * l_ * l_;
        let mdt = 3 * m_dt * m_ * m_;
        let sdt = 3 * s_dt * s_ * s_;
        let ldt2 = 6 * l_dt * l_dt * l_;
        let mdt2 = 6 * m_dt * m_dt * m_;
        let sdt2 = 6 * s_dt * s_dt * s_;
        let r2 = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s - 1;
        let r1 = 4.0767416621 * ldt - 3.3077115913 * mdt + 0.2309699292 * sdt;
        let r22 = 4.0767416621 * ldt2 - 3.3077115913 * mdt2 + 0.2309699292 * sdt2;
        let u_r = r1 / (r1 * r1 - 0.5 * r2 * r22);
        let t_r = -r2 * u_r;
        let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s - 1;
        let g1 = -1.2684380046 * ldt + 2.6097574011 * mdt - 0.3413193965 * sdt;
        let g2 = -1.2684380046 * ldt2 + 2.6097574011 * mdt2 - 0.3413193965 * sdt2;
        let u_g = g1 / (g1 * g1 - 0.5 * g * g2);
        let t_g = -g * u_g;
        let b2 = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s - 1;
        let b1 = -0.0041960863 * ldt - 0.7034186147 * mdt + 1.707614701 * sdt;
        let b22 = -0.0041960863 * ldt2 - 0.7034186147 * mdt2 + 1.707614701 * sdt2;
        let u_b = b1 / (b1 * b1 - 0.5 * b2 * b22);
        let t_b = -b2 * u_b;
        t_r = u_r >= 0 ? t_r : 1e6;
        t_g = u_g >= 0 ? t_g : 1e6;
        t_b = u_b >= 0 ? t_b : 1e6;
        t += Math.min(t_r, Math.min(t_g, t_b));
      }
    }
  }
  return t;
}
function get_ST_max(a_, b_, cusp = null) {
  if (!cusp) {
    cusp = find_cusp(a_, b_);
  }
  let L = cusp[0];
  let C = cusp[1];
  return [C / L, C / (1 - L)];
}
function get_Cs(L, a_, b_) {
  let cusp = find_cusp(a_, b_);
  let C_max = find_gamut_intersection(a_, b_, L, 1, L, cusp);
  let ST_max = get_ST_max(a_, b_, cusp);
  let S_mid = 0.11516993 + 1 / (7.4477897 + 4.1590124 * b_ + a_ * (-2.19557347 + 1.75198401 * b_ + a_ * (-2.13704948 - 10.02301043 * b_ + a_ * (-4.24894561 + 5.38770819 * b_ + 4.69891013 * a_))));
  let T_mid = 0.11239642 + 1 / (1.6132032 - 0.68124379 * b_ + a_ * (0.40370612 + 0.90148123 * b_ + a_ * (-0.27087943 + 0.6122399 * b_ + a_ * (299215e-8 - 0.45399568 * b_ - 0.14661872 * a_))));
  let k4 = C_max / Math.min(L * ST_max[0], (1 - L) * ST_max[1]);
  let C_a = L * S_mid;
  let C_b = (1 - L) * T_mid;
  let C_mid = 0.9 * k4 * Math.sqrt(
    Math.sqrt(
      1 / (1 / (C_a * C_a * C_a * C_a) + 1 / (C_b * C_b * C_b * C_b))
    )
  );
  C_a = L * 0.4;
  C_b = (1 - L) * 0.8;
  let C_0 = Math.sqrt(1 / (1 / (C_a * C_a) + 1 / (C_b * C_b)));
  return [C_0, C_mid, C_max];
}

// node_modules/culori/src/okhsl/convertOklabToOkhsl.js
function convertOklabToOkhsl(lab2) {
  const l = lab2.l !== void 0 ? lab2.l : 0;
  const a = lab2.a !== void 0 ? lab2.a : 0;
  const b = lab2.b !== void 0 ? lab2.b : 0;
  const ret = { mode: "okhsl", l: toe(l) };
  if (lab2.alpha !== void 0) {
    ret.alpha = lab2.alpha;
  }
  let c2 = Math.sqrt(a * a + b * b);
  if (!c2) {
    ret.s = 0;
    return ret;
  }
  let [C_0, C_mid, C_max] = get_Cs(l, a / c2, b / c2);
  let s;
  if (c2 < C_mid) {
    let k_0 = 0;
    let k_1 = 0.8 * C_0;
    let k_2 = 1 - k_1 / C_mid;
    let t = (c2 - k_0) / (k_1 + k_2 * (c2 - k_0));
    s = t * 0.8;
  } else {
    let k_0 = C_mid;
    let k_1 = 0.2 * C_mid * C_mid * 1.25 * 1.25 / C_0;
    let k_2 = 1 - k_1 / (C_max - C_mid);
    let t = (c2 - k_0) / (k_1 + k_2 * (c2 - k_0));
    s = 0.8 + 0.2 * t;
  }
  if (s) {
    ret.s = s;
    ret.h = normalizeHue_default(Math.atan2(b, a) * 180 / Math.PI);
  }
  return ret;
}

// node_modules/culori/src/okhsl/convertOkhslToOklab.js
function convertOkhslToOklab(hsl3) {
  let h = hsl3.h !== void 0 ? hsl3.h : 0;
  let s = hsl3.s !== void 0 ? hsl3.s : 0;
  let l = hsl3.l !== void 0 ? hsl3.l : 0;
  const ret = { mode: "oklab", l: toe_inv(l) };
  if (hsl3.alpha !== void 0) {
    ret.alpha = hsl3.alpha;
  }
  if (!s || l === 1) {
    ret.a = ret.b = 0;
    return ret;
  }
  let a_ = Math.cos(h / 180 * Math.PI);
  let b_ = Math.sin(h / 180 * Math.PI);
  let [C_0, C_mid, C_max] = get_Cs(ret.l, a_, b_);
  let t, k_0, k_1, k_2;
  if (s < 0.8) {
    t = 1.25 * s;
    k_0 = 0;
    k_1 = 0.8 * C_0;
    k_2 = 1 - k_1 / C_mid;
  } else {
    t = 5 * (s - 0.8);
    k_0 = C_mid;
    k_1 = 0.2 * C_mid * C_mid * 1.25 * 1.25 / C_0;
    k_2 = 1 - k_1 / (C_max - C_mid);
  }
  let C = k_0 + t * k_1 / (1 - k_2 * t);
  ret.a = C * a_;
  ret.b = C * b_;
  return ret;
}

// node_modules/culori/src/okhsl/modeOkhsl.js
var modeOkhsl = {
  ...definition_default7,
  mode: "okhsl",
  channels: ["h", "s", "l", "alpha"],
  parse: ["--okhsl"],
  serialize: "--okhsl",
  fromMode: {
    oklab: convertOklabToOkhsl,
    rgb: (c2) => convertOklabToOkhsl(convertRgbToOklab_default(c2))
  },
  toMode: {
    oklab: convertOkhslToOklab,
    rgb: (c2) => convertOklabToRgb_default(convertOkhslToOklab(c2))
  }
};
var modeOkhsl_default = modeOkhsl;

// node_modules/culori/src/okhsv/convertOklabToOkhsv.js
function convertOklabToOkhsv(lab2) {
  let l = lab2.l !== void 0 ? lab2.l : 0;
  let a = lab2.a !== void 0 ? lab2.a : 0;
  let b = lab2.b !== void 0 ? lab2.b : 0;
  let c2 = Math.sqrt(a * a + b * b);
  let a_ = c2 ? a / c2 : 1;
  let b_ = c2 ? b / c2 : 1;
  let [S_max, T] = get_ST_max(a_, b_);
  let S_0 = 0.5;
  let k4 = 1 - S_0 / S_max;
  let t = T / (c2 + l * T);
  let L_v = t * l;
  let C_v = t * c2;
  let L_vt = toe_inv(L_v);
  let C_vt = C_v * L_vt / L_v;
  let rgb_scale = convertOklabToLrgb_default({ l: L_vt, a: a_ * C_vt, b: b_ * C_vt });
  let scale_L = Math.cbrt(
    1 / Math.max(rgb_scale.r, rgb_scale.g, rgb_scale.b, 0)
  );
  l = l / scale_L;
  c2 = c2 / scale_L * toe(l) / l;
  l = toe(l);
  const ret = {
    mode: "okhsv",
    s: c2 ? (S_0 + T) * C_v / (T * S_0 + T * k4 * C_v) : 0,
    v: l ? l / L_v : 0
  };
  if (ret.s) {
    ret.h = normalizeHue_default(Math.atan2(b, a) * 180 / Math.PI);
  }
  if (lab2.alpha !== void 0) {
    ret.alpha = lab2.alpha;
  }
  return ret;
}

// node_modules/culori/src/okhsv/convertOkhsvToOklab.js
function convertOkhsvToOklab(hsv2) {
  const ret = { mode: "oklab" };
  if (hsv2.alpha !== void 0) {
    ret.alpha = hsv2.alpha;
  }
  const h = hsv2.h !== void 0 ? hsv2.h : 0;
  const s = hsv2.s !== void 0 ? hsv2.s : 0;
  const v = hsv2.v !== void 0 ? hsv2.v : 0;
  const a_ = Math.cos(h / 180 * Math.PI);
  const b_ = Math.sin(h / 180 * Math.PI);
  const [S_max, T] = get_ST_max(a_, b_);
  const S_0 = 0.5;
  const k4 = 1 - S_0 / S_max;
  const L_v = 1 - s * S_0 / (S_0 + T - T * k4 * s);
  const C_v = s * T * S_0 / (S_0 + T - T * k4 * s);
  const L_vt = toe_inv(L_v);
  const C_vt = C_v * L_vt / L_v;
  const rgb_scale = convertOklabToLrgb_default({
    l: L_vt,
    a: a_ * C_vt,
    b: b_ * C_vt
  });
  const scale_L = Math.cbrt(
    1 / Math.max(rgb_scale.r, rgb_scale.g, rgb_scale.b, 0)
  );
  const L_new = toe_inv(v * L_v);
  const C = C_v * L_new / L_v;
  ret.l = L_new * scale_L;
  ret.a = C * a_ * scale_L;
  ret.b = C * b_ * scale_L;
  return ret;
}

// node_modules/culori/src/okhsv/modeOkhsv.js
var modeOkhsv = {
  ...definition_default8,
  mode: "okhsv",
  channels: ["h", "s", "v", "alpha"],
  parse: ["--okhsv"],
  serialize: "--okhsv",
  fromMode: {
    oklab: convertOklabToOkhsv,
    rgb: (c2) => convertOklabToOkhsv(convertRgbToOklab_default(c2))
  },
  toMode: {
    oklab: convertOkhsvToOklab,
    rgb: (c2) => convertOklabToRgb_default(convertOkhsvToOklab(c2))
  }
};
var modeOkhsv_default = modeOkhsv;

// node_modules/culori/src/oklab/parseOklab.js
function parseOklab(color, parsed) {
  if (!parsed || parsed[0] !== "oklab") {
    return void 0;
  }
  const res = { mode: "oklab" };
  const [, l, a, b, alpha] = parsed;
  if (l.type === Tok.Hue || a.type === Tok.Hue || b.type === Tok.Hue) {
    return void 0;
  }
  if (l.type !== Tok.None) {
    res.l = Math.min(
      Math.max(0, l.type === Tok.Number ? l.value : l.value / 100),
      1
    );
  }
  if (a.type !== Tok.None) {
    res.a = a.type === Tok.Number ? a.value : a.value * 0.4 / 100;
  }
  if (b.type !== Tok.None) {
    res.b = b.type === Tok.Number ? b.value : b.value * 0.4 / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseOklab_default = parseOklab;

// node_modules/culori/src/oklab/definition.js
var definition20 = {
  ...definition_default13,
  mode: "oklab",
  toMode: {
    lrgb: convertOklabToLrgb_default,
    rgb: convertOklabToRgb_default
  },
  fromMode: {
    lrgb: convertLrgbToOklab_default,
    rgb: convertRgbToOklab_default
  },
  ranges: {
    l: [0, 1],
    a: [-0.4, 0.4],
    b: [-0.4, 0.4]
  },
  parse: [parseOklab_default],
  serialize: (c2) => `oklab(${c2.l !== void 0 ? c2.l : "none"} ${c2.a !== void 0 ? c2.a : "none"} ${c2.b !== void 0 ? c2.b : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`
};
var definition_default20 = definition20;

// node_modules/culori/src/oklch/parseOklch.js
function parseOklch(color, parsed) {
  if (!parsed || parsed[0] !== "oklch") {
    return void 0;
  }
  const res = { mode: "oklch" };
  const [, l, c2, h, alpha] = parsed;
  if (l.type !== Tok.None) {
    if (l.type === Tok.Hue) {
      return void 0;
    }
    res.l = Math.min(
      Math.max(0, l.type === Tok.Number ? l.value : l.value / 100),
      1
    );
  }
  if (c2.type !== Tok.None) {
    res.c = Math.max(
      0,
      c2.type === Tok.Number ? c2.value : c2.value * 0.4 / 100
    );
  }
  if (h.type !== Tok.None) {
    if (h.type === Tok.Percentage) {
      return void 0;
    }
    res.h = h.value;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseOklch_default = parseOklch;

// node_modules/culori/src/oklch/definition.js
var definition21 = {
  ...definition_default15,
  mode: "oklch",
  toMode: {
    oklab: (c2) => convertLchToLab_default(c2, "oklab"),
    rgb: (c2) => convertOklabToRgb_default(convertLchToLab_default(c2, "oklab"))
  },
  fromMode: {
    rgb: (c2) => convertLabToLch_default(convertRgbToOklab_default(c2), "oklch"),
    oklab: (c2) => convertLabToLch_default(c2, "oklch")
  },
  parse: [parseOklch_default],
  serialize: (c2) => `oklch(${c2.l !== void 0 ? c2.l : "none"} ${c2.c !== void 0 ? c2.c : "none"} ${c2.h !== void 0 ? c2.h : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  ranges: {
    l: [0, 1],
    c: [0, 0.4],
    h: [0, 360]
  }
};
var definition_default21 = definition21;

// node_modules/culori/src/p3/convertP3ToXyz65.js
var convertP3ToXyz65 = (rgb3) => {
  let { r: r2, g, b, alpha } = convertRgbToLrgb_default(rgb3);
  let res = {
    mode: "xyz65",
    x: 0.486570948648216 * r2 + 0.265667693169093 * g + 0.1982172852343625 * b,
    y: 0.2289745640697487 * r2 + 0.6917385218365062 * g + 0.079286914093745 * b,
    z: 0 * r2 + 0.0451133818589026 * g + 1.043944368900976 * b
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertP3ToXyz65_default = convertP3ToXyz65;

// node_modules/culori/src/p3/convertXyz65ToP3.js
var convertXyz65ToP3 = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = convertLrgbToRgb_default(
    {
      r: x * 2.4934969119414263 - y * 0.9313836179191242 - 0.402710784450717 * z,
      g: x * -0.8294889695615749 + y * 1.7626640603183465 + 0.0236246858419436 * z,
      b: x * 0.0358458302437845 - y * 0.0761723892680418 + 0.9568845240076871 * z
    },
    "p3"
  );
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToP3_default = convertXyz65ToP3;

// node_modules/culori/src/p3/definition.js
var definition22 = {
  ...definition_default,
  mode: "p3",
  parse: ["display-p3"],
  serialize: "display-p3",
  fromMode: {
    rgb: (color) => convertXyz65ToP3_default(convertRgbToXyz65_default(color)),
    xyz65: convertXyz65ToP3_default
  },
  toMode: {
    rgb: (color) => convertXyz65ToRgb_default(convertP3ToXyz65_default(color)),
    xyz65: convertP3ToXyz65_default
  }
};
var definition_default22 = definition22;

// node_modules/culori/src/prophoto/convertXyz50ToProphoto.js
var gamma2 = (v) => {
  let abs2 = Math.abs(v);
  if (abs2 >= 1 / 512) {
    return Math.sign(v) * Math.pow(abs2, 1 / 1.8);
  }
  return 16 * v;
};
var convertXyz50ToProphoto = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "prophoto",
    r: gamma2(
      x * 1.3457868816471585 - y * 0.2555720873797946 - 0.0511018649755453 * z
    ),
    g: gamma2(
      x * -0.5446307051249019 + y * 1.5082477428451466 + 0.0205274474364214 * z
    ),
    b: gamma2(x * 0 + y * 0 + 1.2119675456389452 * z)
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToProphoto_default = convertXyz50ToProphoto;

// node_modules/culori/src/prophoto/convertProphotoToXyz50.js
var linearize2 = (v = 0) => {
  let abs2 = Math.abs(v);
  if (abs2 >= 16 / 512) {
    return Math.sign(v) * Math.pow(abs2, 1.8);
  }
  return v / 16;
};
var convertProphotoToXyz50 = (prophoto2) => {
  let r2 = linearize2(prophoto2.r);
  let g = linearize2(prophoto2.g);
  let b = linearize2(prophoto2.b);
  let res = {
    mode: "xyz50",
    x: 0.7977666449006423 * r2 + 0.1351812974005331 * g + 0.0313477341283922 * b,
    y: 0.2880748288194013 * r2 + 0.7118352342418731 * g + 899369387256e-16 * b,
    z: 0 * r2 + 0 * g + 0.8251046025104602 * b
  };
  if (prophoto2.alpha !== void 0) {
    res.alpha = prophoto2.alpha;
  }
  return res;
};
var convertProphotoToXyz50_default = convertProphotoToXyz50;

// node_modules/culori/src/prophoto/definition.js
var definition23 = {
  ...definition_default,
  mode: "prophoto",
  parse: ["prophoto-rgb"],
  serialize: "prophoto-rgb",
  fromMode: {
    xyz50: convertXyz50ToProphoto_default,
    rgb: (color) => convertXyz50ToProphoto_default(convertRgbToXyz50_default(color))
  },
  toMode: {
    xyz50: convertProphotoToXyz50_default,
    rgb: (color) => convertXyz50ToRgb_default(convertProphotoToXyz50_default(color))
  }
};
var definition_default23 = definition23;

// node_modules/culori/src/rec2020/convertXyz65ToRec2020.js
var \u03B1 = 1.09929682680944;
var \u03B2 = 0.018053968510807;
var gamma3 = (v) => {
  const abs2 = Math.abs(v);
  if (abs2 > \u03B2) {
    return (Math.sign(v) || 1) * (\u03B1 * Math.pow(abs2, 0.45) - (\u03B1 - 1));
  }
  return 4.5 * v;
};
var convertXyz65ToRec2020 = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "rec2020",
    r: gamma3(
      x * 1.7166511879712683 - y * 0.3556707837763925 - 0.2533662813736599 * z
    ),
    g: gamma3(
      x * -0.6666843518324893 + y * 1.6164812366349395 + 0.0157685458139111 * z
    ),
    b: gamma3(
      x * 0.0176398574453108 - y * 0.0427706132578085 + 0.9421031212354739 * z
    )
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToRec2020_default = convertXyz65ToRec2020;

// node_modules/culori/src/rec2020/convertRec2020ToXyz65.js
var \u03B12 = 1.09929682680944;
var \u03B22 = 0.018053968510807;
var linearize3 = (v = 0) => {
  let abs2 = Math.abs(v);
  if (abs2 < \u03B22 * 4.5) {
    return v / 4.5;
  }
  return (Math.sign(v) || 1) * Math.pow((abs2 + \u03B12 - 1) / \u03B12, 1 / 0.45);
};
var convertRec2020ToXyz65 = (rec20202) => {
  let r2 = linearize3(rec20202.r);
  let g = linearize3(rec20202.g);
  let b = linearize3(rec20202.b);
  let res = {
    mode: "xyz65",
    x: 0.6369580483012911 * r2 + 0.1446169035862083 * g + 0.1688809751641721 * b,
    y: 0.262700212011267 * r2 + 0.6779980715188708 * g + 0.059301716469862 * b,
    z: 0 * r2 + 0.0280726930490874 * g + 1.0609850577107909 * b
  };
  if (rec20202.alpha !== void 0) {
    res.alpha = rec20202.alpha;
  }
  return res;
};
var convertRec2020ToXyz65_default = convertRec2020ToXyz65;

// node_modules/culori/src/rec2020/definition.js
var definition24 = {
  ...definition_default,
  mode: "rec2020",
  fromMode: {
    xyz65: convertXyz65ToRec2020_default,
    rgb: (color) => convertXyz65ToRec2020_default(convertRgbToXyz65_default(color))
  },
  toMode: {
    xyz65: convertRec2020ToXyz65_default,
    rgb: (color) => convertXyz65ToRgb_default(convertRec2020ToXyz65_default(color))
  },
  parse: ["rec2020"],
  serialize: "rec2020"
};
var definition_default24 = definition24;

// node_modules/culori/src/xyb/constants.js
var bias = 0.0037930732552754493;
var bias_cbrt = Math.cbrt(bias);

// node_modules/culori/src/xyb/convertRgbToXyb.js
var transfer = (v) => Math.cbrt(v) - bias_cbrt;
var convertRgbToXyb = (color) => {
  const { r: r2, g, b, alpha } = convertRgbToLrgb_default(color);
  const l = transfer(0.3 * r2 + 0.622 * g + 0.078 * b + bias);
  const m = transfer(0.23 * r2 + 0.692 * g + 0.078 * b + bias);
  const s = transfer(
    0.2434226892454782 * r2 + 0.2047674442449682 * g + 0.5518098665095535 * b + bias
  );
  const res = {
    mode: "xyb",
    x: (l - m) / 2,
    y: (l + m) / 2,
    /* Apply default chroma from luma (subtract Y from B) */
    b: s - (l + m) / 2
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertRgbToXyb_default = convertRgbToXyb;

// node_modules/culori/src/xyb/convertXybToRgb.js
var transfer2 = (v) => Math.pow(v + bias_cbrt, 3);
var convertXybToRgb = ({ x, y, b, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (b === void 0) b = 0;
  const l = transfer2(x + y) - bias;
  const m = transfer2(y - x) - bias;
  const s = transfer2(b + y) - bias;
  const res = convertLrgbToRgb_default({
    r: 11.031566904639861 * l - 9.866943908131562 * m - 0.16462299650829934 * s,
    g: -3.2541473810744237 * l + 4.418770377582723 * m - 0.16462299650829934 * s,
    b: -3.6588512867136815 * l + 2.7129230459360922 * m + 1.9459282407775895 * s
  });
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertXybToRgb_default = convertXybToRgb;

// node_modules/culori/src/xyb/definition.js
var definition25 = {
  mode: "xyb",
  channels: ["x", "y", "b", "alpha"],
  parse: ["--xyb"],
  serialize: "--xyb",
  toMode: {
    rgb: convertXybToRgb_default
  },
  fromMode: {
    rgb: convertRgbToXyb_default
  },
  ranges: {
    x: [-0.0154, 0.0281],
    y: [0, 0.8453],
    b: [-0.2778, 0.388]
  },
  interpolate: {
    x: interpolatorLinear,
    y: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default25 = definition25;

// node_modules/culori/src/xyz50/definition.js
var definition26 = {
  mode: "xyz50",
  parse: ["xyz-d50"],
  serialize: "xyz-d50",
  toMode: {
    rgb: convertXyz50ToRgb_default,
    lab: convertXyz50ToLab_default
  },
  fromMode: {
    rgb: convertRgbToXyz50_default,
    lab: convertLabToXyz50_default
  },
  channels: ["x", "y", "z", "alpha"],
  ranges: {
    x: [0, 0.964],
    y: [0, 0.999],
    z: [0, 0.825]
  },
  interpolate: {
    x: interpolatorLinear,
    y: interpolatorLinear,
    z: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default26 = definition26;

// node_modules/culori/src/xyz65/convertXyz65ToXyz50.js
var convertXyz65ToXyz50 = (xyz652) => {
  let { x, y, z, alpha } = xyz652;
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "xyz50",
    x: 1.0479298208405488 * x + 0.0229467933410191 * y - 0.0501922295431356 * z,
    y: 0.0296278156881593 * x + 0.990434484573249 * y - 0.0170738250293851 * z,
    z: -0.0092430581525912 * x + 0.0150551448965779 * y + 0.7518742899580008 * z
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToXyz50_default = convertXyz65ToXyz50;

// node_modules/culori/src/xyz65/convertXyz50ToXyz65.js
var convertXyz50ToXyz65 = (xyz502) => {
  let { x, y, z, alpha } = xyz502;
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "xyz65",
    x: 0.9554734527042182 * x - 0.0230985368742614 * y + 0.0632593086610217 * z,
    y: -0.0283697069632081 * x + 1.0099954580058226 * y + 0.021041398966943 * z,
    z: 0.0123140016883199 * x - 0.0205076964334779 * y + 1.3303659366080753 * z
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToXyz65_default = convertXyz50ToXyz65;

// node_modules/culori/src/xyz65/definition.js
var definition27 = {
  mode: "xyz65",
  toMode: {
    rgb: convertXyz65ToRgb_default,
    xyz50: convertXyz65ToXyz50_default
  },
  fromMode: {
    rgb: convertRgbToXyz65_default,
    xyz50: convertXyz50ToXyz65_default
  },
  ranges: {
    x: [0, 0.95],
    y: [0, 1],
    z: [0, 1.088]
  },
  channels: ["x", "y", "z", "alpha"],
  parse: ["xyz", "xyz-d65"],
  serialize: "xyz-d65",
  interpolate: {
    x: interpolatorLinear,
    y: interpolatorLinear,
    z: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default27 = definition27;

// node_modules/culori/src/yiq/convertRgbToYiq.js
var convertRgbToYiq = ({ r: r2, g, b, alpha }) => {
  if (r2 === void 0) r2 = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  const res = {
    mode: "yiq",
    y: 0.29889531 * r2 + 0.58662247 * g + 0.11448223 * b,
    i: 0.59597799 * r2 - 0.2741761 * g - 0.32180189 * b,
    q: 0.21147017 * r2 - 0.52261711 * g + 0.31114694 * b
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertRgbToYiq_default = convertRgbToYiq;

// node_modules/culori/src/yiq/convertYiqToRgb.js
var convertYiqToRgb = ({ y, i, q, alpha }) => {
  if (y === void 0) y = 0;
  if (i === void 0) i = 0;
  if (q === void 0) q = 0;
  const res = {
    mode: "rgb",
    r: y + 0.95608445 * i + 0.6208885 * q,
    g: y - 0.27137664 * i - 0.6486059 * q,
    b: y - 1.10561724 * i + 1.70250126 * q
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertYiqToRgb_default = convertYiqToRgb;

// node_modules/culori/src/yiq/definition.js
var definition28 = {
  mode: "yiq",
  toMode: {
    rgb: convertYiqToRgb_default
  },
  fromMode: {
    rgb: convertRgbToYiq_default
  },
  channels: ["y", "i", "q", "alpha"],
  parse: ["--yiq"],
  serialize: "--yiq",
  ranges: {
    i: [-0.595, 0.595],
    q: [-0.522, 0.522]
  },
  interpolate: {
    y: interpolatorLinear,
    i: interpolatorLinear,
    q: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default28 = definition28;

// node_modules/culori/src/round.js
var r = (value, precision) => Math.round(value * (precision = Math.pow(10, precision))) / precision;
var round = (precision = 4) => (value) => typeof value === "number" ? r(value, precision) : value;
var round_default = round;

// node_modules/culori/src/formatter.js
var twoDecimals = round_default(2);
var clamp = (value) => Math.max(0, Math.min(1, value || 0));
var fixup = (value) => Math.round(clamp(value) * 255);
var rgb = converter_default("rgb");
var hsl = converter_default("hsl");
var serializeHex = (color) => {
  if (color === void 0) {
    return void 0;
  }
  let r2 = fixup(color.r);
  let g = fixup(color.g);
  let b = fixup(color.b);
  return "#" + (1 << 24 | r2 << 16 | g << 8 | b).toString(16).slice(1);
};
var serializeHex8 = (color) => {
  if (color === void 0) {
    return void 0;
  }
  let a = fixup(color.alpha !== void 0 ? color.alpha : 1);
  return serializeHex(color) + (1 << 8 | a).toString(16).slice(1);
};
var formatHex = (c2) => serializeHex(rgb(c2));
var formatHex8 = (c2) => serializeHex8(rgb(c2));

// node_modules/culori/src/index.js
var a98 = useMode(definition_default2);
var cubehelix = useMode(definition_default3);
var dlab = useMode(definition_default4);
var dlch = useMode(definition_default5);
var hsi = useMode(definition_default6);
var hsl2 = useMode(definition_default7);
var hsv = useMode(definition_default8);
var hwb = useMode(definition_default9);
var itp = useMode(definition_default10);
var jab = useMode(definition_default11);
var jch = useMode(definition_default12);
var lab = useMode(definition_default13);
var lab65 = useMode(definition_default14);
var lch = useMode(definition_default15);
var lch65 = useMode(definition_default16);
var lchuv = useMode(definition_default17);
var lrgb = useMode(definition_default18);
var luv = useMode(definition_default19);
var okhsl = useMode(modeOkhsl_default);
var okhsv = useMode(modeOkhsv_default);
var oklab = useMode(definition_default20);
var oklch = useMode(definition_default21);
var p3 = useMode(definition_default22);
var prophoto = useMode(definition_default23);
var rec2020 = useMode(definition_default24);
var rgb2 = useMode(definition_default);
var xyb = useMode(definition_default25);
var xyz50 = useMode(definition_default26);
var xyz65 = useMode(definition_default27);
var yiq = useMode(definition_default28);

// src/engines/a11y/contrast.ts
var THRESHOLDS = {
  AA: { normal: 4.5, large: 3 },
  AAA: { normal: 7, large: 4.5 }
};
function requiredRatio(level, size) {
  return THRESHOLDS[level][size];
}
function linearize4(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
function relativeLuminance(color) {
  const parsed = parse_default(color);
  if (parsed === void 0) return void 0;
  const srgb = rgb2(parsed);
  if (srgb === void 0) return void 0;
  const r2 = linearize4(srgb.r);
  const g = linearize4(srgb.g);
  const b = linearize4(srgb.b);
  return 0.2126 * r2 + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(fg, bg) {
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  if (lFg === void 0 || lBg === void 0) return void 0;
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

// src/engines/a11y/audit.ts
var FG_RE = /(^|[.\-/])(text|fg|foreground|on-[a-z0-9]+|on)([.\-/]|$)/i;
var BG_RE = /(^|[.\-/])(bg|background|surface|fill)([.\-/]|$)/i;
function isColor(token) {
  return token.type === "color" && typeof token.value === "string";
}
function isForegroundRole(name) {
  return FG_RE.test(name);
}
function isBackgroundRole(name) {
  return BG_RE.test(name);
}
function byName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
function pairColorTokens(map) {
  const colors3 = map.tokens.filter(isColor);
  const foregrounds = colors3.filter((t) => isForegroundRole(t.name)).sort(byName);
  const backgrounds = colors3.filter((t) => isBackgroundRole(t.name)).sort(byName);
  const pairs = [];
  for (const foreground of foregrounds) {
    for (const background of backgrounds) {
      if (foreground.name === background.name) continue;
      pairs.push({ foreground, background });
    }
  }
  return pairs;
}
var SUGGESTION_STEPS = 1e3;
function suggestForeground(fg, bg, required) {
  const parsed = parse_default(fg);
  if (parsed === void 0) return { kind: "none" };
  const base = oklch(parsed);
  if (base === void 0) return { kind: "none" };
  const bgLuminance = relativeLuminance(bg);
  if (bgLuminance === void 0) return { kind: "none" };
  const direction = bgLuminance > 0.5 ? -1 : 1;
  const baseL = base.l;
  for (let step = 0; step <= SUGGESTION_STEPS; step += 1) {
    const lightness = Math.min(
      1,
      Math.max(0, baseL + direction * (step / SUGGESTION_STEPS))
    );
    const candidate = formatHex(rgb2({ ...base, l: lightness }));
    if (candidate === void 0) continue;
    const ratio = contrastRatio(candidate, bg);
    if (ratio !== void 0 && ratio >= required) {
      return { kind: "adjusted", value: candidate };
    }
  }
  return { kind: "none" };
}
function auditPair(mode, pair, level) {
  const fgValue = pair.foreground.value;
  const bgValue = pair.background.value;
  const required = requiredRatio(level, "normal");
  const ratio = contrastRatio(fgValue, bgValue);
  if (ratio === void 0) {
    return {
      mode,
      foreground: pair.foreground.name,
      background: pair.background.name,
      foregroundValue: fgValue,
      backgroundValue: bgValue,
      required,
      status: "unparseable"
    };
  }
  if (ratio >= required) {
    return {
      mode,
      foreground: pair.foreground.name,
      background: pair.background.name,
      foregroundValue: fgValue,
      backgroundValue: bgValue,
      ratio,
      required,
      status: "pass"
    };
  }
  return {
    mode,
    foreground: pair.foreground.name,
    background: pair.background.name,
    foregroundValue: fgValue,
    backgroundValue: bgValue,
    ratio,
    required,
    status: "fail",
    suggestion: suggestForeground(fgValue, bgValue, required)
  };
}
function auditContrast(modes2, options) {
  const findings = [];
  for (const { mode, map } of modes2) {
    for (const pair of pairColorTokens(map)) {
      findings.push(auditPair(mode, pair, options.level));
    }
  }
  findings.sort(
    (a, b) => (a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0) || (a.foreground < b.foreground ? -1 : a.foreground > b.foreground ? 1 : 0) || (a.background < b.background ? -1 : a.background > b.background ? 1 : 0)
  );
  let passed = 0;
  let failed = 0;
  let unparseable = 0;
  for (const finding of findings) {
    if (finding.status === "pass") passed += 1;
    else if (finding.status === "fail") failed += 1;
    else unparseable += 1;
  }
  return {
    level: options.level,
    findings,
    summary: { total: findings.length, passed, failed, unparseable }
  };
}

// src/engines/tokens/detect.ts
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasW3cValue(node) {
  return "$value" in node;
}
function hasPlainValue(node) {
  return "value" in node;
}
function scan(node, acc) {
  for (const key of Object.keys(node)) {
    if (key.startsWith("$")) acc.hasDollarMarker = true;
  }
  if (hasW3cValue(node)) {
    acc.hasW3c = true;
    return;
  }
  if (hasPlainValue(node)) {
    acc.hasPlain = true;
    if ("type" in node) acc.hasPlainWithType = true;
    return;
  }
  for (const child of Object.values(node)) {
    if (isObject(child)) scan(child, acc);
  }
}
function detectFormat(source) {
  if (!isObject(source)) return "unknown";
  const hasThemes = "$themes" in source;
  const hasMetadata = "$metadata" in source;
  const acc = {
    hasW3c: false,
    hasPlain: false,
    hasPlainWithType: false,
    hasDollarMarker: false
  };
  scan(source, acc);
  if (acc.hasW3c) return "w3c";
  if (hasThemes || hasMetadata) return "tokens-studio";
  if (acc.hasPlainWithType) return "tokens-studio";
  if (acc.hasPlain && !acc.hasDollarMarker) return "style-dictionary";
  return "unknown";
}

// src/engines/tokens/parse-style-dictionary.ts
function isObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function inferType(firstSegment) {
  switch (firstSegment) {
    case "color":
      return "color";
    case "size":
    case "space":
    case "spacing":
      return "dimension";
    case "time":
      return "duration";
    default:
      return "other";
  }
}
var ALIAS_PATTERN = /^\{(.+)\}$/;
function aliasTarget(value) {
  if (typeof value !== "string") return void 0;
  const match = ALIAS_PATTERN.exec(value);
  if (match === null) return void 0;
  const inner = match[1];
  if (inner === void 0) return void 0;
  return inner.endsWith(".value") ? inner.slice(0, -".value".length) : inner;
}
function collect(node, path, raws, errors) {
  if ("value" in node) {
    const name = path.join(".");
    const firstSegment = path[0] ?? "";
    const value = node.value;
    if (typeof value !== "string" && typeof value !== "number") {
      errors.push({
        code: "invalid-shape",
        path: name,
        message: `Token "${name}" has a non-scalar value; Style Dictionary leaves must be a string or number.`
      });
      return;
    }
    const comment = node.comment;
    const description = typeof comment === "string" ? comment : void 0;
    raws.push({
      name,
      type: inferType(firstSegment),
      group: firstSegment,
      rawValue: value,
      description,
      aliasOf: aliasTarget(value)
    });
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (isObject2(child)) {
      collect(child, [...path, key], raws, errors);
    } else {
      const name = [...path, key].join(".");
      errors.push({
        code: "invalid-shape",
        path: name,
        message: `Node "${name}" is neither a token leaf (with a "value") nor a group object.`
      });
    }
  }
}
function resolve(start, byName2) {
  const seen = /* @__PURE__ */ new Set([start.name]);
  let current = start;
  while (current.aliasOf !== void 0) {
    const targetName = current.aliasOf;
    if (seen.has(targetName)) {
      return {
        ok: false,
        error: {
          code: "alias-cycle",
          path: start.name,
          message: `Alias cycle detected resolving "${start.name}" (revisited "${targetName}").`
        }
      };
    }
    const next = byName2.get(targetName);
    if (next === void 0) {
      return {
        ok: false,
        error: {
          code: "unknown-alias",
          path: current.name,
          message: `Alias "${current.name}" references unknown token "${targetName}".`
        }
      };
    }
    seen.add(targetName);
    current = next;
  }
  return { ok: true, value: current.rawValue };
}
function parseStyleDictionary(source) {
  if (!isObject2(source)) {
    return {
      kind: "error",
      errors: [
        {
          code: "invalid-shape",
          message: "Style Dictionary source must be a JSON object at the top level."
        }
      ]
    };
  }
  const raws = [];
  const errors = [];
  collect(source, [], raws, errors);
  if (errors.length > 0) {
    return { kind: "error", errors };
  }
  if (raws.length === 0) {
    return {
      kind: "error",
      errors: [
        {
          code: "invalid-shape",
          message: 'Style Dictionary source contains no tokens (no leaves with a "value").'
        }
      ]
    };
  }
  const byName2 = new Map(raws.map((r2) => [r2.name, r2]));
  const tokens = [];
  const resolveErrors = [];
  for (const raw of raws) {
    const resolved = resolve(raw, byName2);
    if (!resolved.ok) {
      resolveErrors.push(resolved.error);
      continue;
    }
    const token = {
      name: raw.name,
      type: raw.type,
      value: resolved.value,
      ...raw.description !== void 0 ? { description: raw.description } : {},
      ...raw.aliasOf !== void 0 ? { aliasOf: raw.aliasOf } : {},
      group: raw.group
    };
    tokens.push(token);
  }
  if (resolveErrors.length > 0) {
    return { kind: "error", errors: resolveErrors };
  }
  tokens.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {
    kind: "ok",
    map: { format: "style-dictionary", tokens },
    warnings: []
  };
}

// src/engines/tokens/parse-tokens-studio.ts
var RESERVED_KEYS = /* @__PURE__ */ new Set(["$themes", "$metadata"]);
function mapType(sourceType) {
  switch (sourceType) {
    case "spacing":
    case "sizing":
    case "borderRadius":
    case "borderWidth":
    case "dimension":
      return "dimension";
    case "fontWeights":
      return "fontWeight";
    case "fontFamilies":
      return "fontFamily";
    case "color":
      return "color";
    case "opacity":
    case "number":
      return "number";
    case "boxShadow":
      return "shadow";
    case "typography":
      return "typography";
    default:
      return "other";
  }
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readLeaf(node) {
  const hasClassic = "value" in node;
  const hasModern = "$value" in node;
  if (!hasClassic && !hasModern) return void 0;
  const value = hasModern ? node.$value : node.value;
  const type = hasModern ? node.$type : node.type;
  const description = node.$description ?? node.description;
  return { value, type, description };
}
var ALIAS_RE = /^\{([^}]+)\}$/;
function aliasTarget2(value) {
  if (typeof value !== "string") return void 0;
  const match = ALIAS_RE.exec(value);
  return match ? match[1] : void 0;
}
function collectSet(setName, tree, out, errors) {
  const walk = (node, pathParts) => {
    const leaf = readLeaf(node);
    if (leaf !== void 0) {
      const path = pathParts.join(".");
      if (leaf.value === void 0) {
        errors.push({
          code: "invalid-shape",
          path: `${setName}.${path}`,
          message: `Token "${path}" in set "${setName}" has no value.`
        });
        return;
      }
      const valueOk = typeof leaf.value === "string" || typeof leaf.value === "number" || isPlainObject(leaf.value);
      if (!valueOk) {
        errors.push({
          code: "invalid-shape",
          path: `${setName}.${path}`,
          message: `Token "${path}" in set "${setName}" has an unsupported value type.`
        });
        return;
      }
      const sourceType = typeof leaf.type === "string" ? leaf.type : "other";
      const raw = {
        name: path,
        type: mapType(sourceType),
        rawValue: leaf.value,
        group: setName
      };
      if (typeof leaf.description === "string") {
        raw.description = leaf.description;
      }
      out.set(path, raw);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (!isPlainObject(child)) {
        errors.push({
          code: "invalid-shape",
          path: `${setName}.${[...pathParts, key].join(".")}`,
          message: `Expected a group or token object at "${[...pathParts, key].join(".")}" in set "${setName}".`
        });
        continue;
      }
      walk(child, [...pathParts, key]);
    }
  };
  walk(tree, []);
}
function resolveSetOrder(root, setNames) {
  const metadata = root.$metadata;
  if (isPlainObject(metadata) && Array.isArray(metadata.tokenSetOrder) && metadata.tokenSetOrder.every((s) => typeof s === "string")) {
    const ordered = metadata.tokenSetOrder.filter((s) => setNames.includes(s));
    for (const name of setNames) {
      if (!ordered.includes(name)) ordered.push(name);
    }
    return ordered;
  }
  return setNames;
}
function parseTokensStudio(source) {
  if (!isPlainObject(source)) {
    return {
      kind: "error",
      errors: [
        {
          code: "invalid-shape",
          message: "Tokens Studio source must be a JSON object."
        }
      ]
    };
  }
  const errors = [];
  const setNames = Object.keys(source).filter((k4) => !RESERVED_KEYS.has(k4));
  const order = resolveSetOrder(source, setNames);
  const merged = /* @__PURE__ */ new Map();
  for (const setName of order) {
    const tree = source[setName];
    if (!isPlainObject(tree)) {
      errors.push({
        code: "invalid-shape",
        path: setName,
        message: `Token set "${setName}" must be an object.`
      });
      continue;
    }
    collectSet(setName, tree, merged, errors);
  }
  if (errors.length > 0) {
    return { kind: "error", errors };
  }
  const resolved = /* @__PURE__ */ new Map();
  const resolve9 = (name, seen) => {
    const cached = resolved.get(name);
    if (cached !== void 0) return cached;
    const raw = merged.get(name);
    if (raw === void 0) {
      errors.push({
        code: "unknown-alias",
        path: name,
        message: `Alias target "${name}" was not found.`
      });
      return void 0;
    }
    const target = aliasTarget2(raw.rawValue);
    if (target === void 0) {
      const result2 = { value: raw.rawValue };
      resolved.set(name, result2);
      return result2;
    }
    if (seen.has(target)) {
      errors.push({
        code: "alias-cycle",
        path: name,
        message: `Alias cycle detected at "${name}" \u2192 "${target}".`
      });
      return void 0;
    }
    const downstream = resolve9(target, new Set(seen).add(target));
    if (downstream === void 0) return void 0;
    const result = { value: downstream.value, aliasOf: target };
    resolved.set(name, result);
    return result;
  };
  const tokens = [];
  for (const [name, raw] of merged) {
    const res = resolve9(name, /* @__PURE__ */ new Set([name]));
    if (res === void 0) continue;
    const token = {
      name,
      type: raw.type,
      value: res.value,
      group: raw.group
    };
    if (raw.description !== void 0) token.description = raw.description;
    if (res.aliasOf !== void 0) token.aliasOf = res.aliasOf;
    tokens.push(token);
  }
  if (errors.length > 0) {
    return { kind: "error", errors };
  }
  tokens.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {
    kind: "ok",
    map: { format: "tokens-studio", tokens },
    warnings: []
  };
}

// src/engines/tokens/parse-w3c.ts
var KNOWN_TYPES = /* @__PURE__ */ new Set([
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "number",
  "shadow",
  "typography"
]);
function isPlainObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function aliasTarget3(value) {
  if (typeof value !== "string") return void 0;
  const match = /^\{([^}]+)\}$/.exec(value.trim());
  return match ? match[1] : void 0;
}
function mapType2(raw, path, warnings) {
  if (typeof raw !== "string") return "other";
  if (KNOWN_TYPES.has(raw)) return raw;
  warnings.push(`${path}: unrecognized $type "${raw}" \u2014 treated as "other"`);
  return "other";
}
function collect2(node, pathSegments, inheritedType, warnings, errors, out) {
  const path = pathSegments.join(".");
  const ownType = "$type" in node && node.$type !== void 0 ? node.$type : inheritedType;
  if ("$value" in node) {
    const value = node.$value;
    if (typeof value !== "string" && typeof value !== "number" && !isPlainObject2(value)) {
      errors.push({
        code: "invalid-shape",
        path,
        message: `${path}: $value must be a string, number, or object`
      });
      return;
    }
    const group = pathSegments[0];
    if (group === void 0) {
      errors.push({
        code: "invalid-shape",
        path,
        message: "token must live under a top-level group"
      });
      return;
    }
    const token = {
      name: path,
      type: mapType2(ownType, path, warnings),
      rawValue: value,
      group
    };
    if (typeof node.$description === "string") {
      token.description = node.$description;
    }
    out.push(token);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    const childPath = [...pathSegments, key];
    if (!isPlainObject2(child)) {
      errors.push({
        code: "invalid-shape",
        path: childPath.join("."),
        message: `${childPath.join(".")}: expected a group or token object`
      });
      continue;
    }
    collect2(child, childPath, ownType, warnings, errors, out);
  }
}
function resolve2(raw, byName2, errors) {
  const direct = aliasTarget3(raw.rawValue);
  if (direct === void 0) return { value: raw.rawValue };
  const seen = /* @__PURE__ */ new Set([raw.name]);
  let currentTarget = direct;
  for (; ; ) {
    const target = byName2.get(currentTarget);
    if (target === void 0) {
      errors.push({
        code: "unknown-alias",
        path: currentTarget,
        message: `${raw.name}: alias references unknown token "${currentTarget}"`
      });
      return void 0;
    }
    if (seen.has(currentTarget)) {
      errors.push({
        code: "alias-cycle",
        path: raw.name,
        message: `alias cycle involving "${raw.name}"`
      });
      return void 0;
    }
    seen.add(currentTarget);
    const next = aliasTarget3(target.rawValue);
    if (next === void 0) {
      return { value: target.rawValue, aliasOf: direct };
    }
    currentTarget = next;
  }
}
function parseW3c(source) {
  if (!isPlainObject2(source)) {
    return {
      kind: "error",
      errors: [
        {
          code: "invalid-shape",
          message: "root must be a JSON object"
        }
      ]
    };
  }
  const warnings = [];
  const errors = [];
  const raws = [];
  collect2(source, [], void 0, warnings, errors, raws);
  if (errors.length > 0) {
    return { kind: "error", errors };
  }
  const byName2 = new Map(raws.map((r2) => [r2.name, r2]));
  const tokens = [];
  for (const raw of raws) {
    const resolved = resolve2(raw, byName2, errors);
    if (resolved === void 0) continue;
    const token = {
      name: raw.name,
      type: raw.type,
      value: resolved.value,
      group: raw.group
    };
    if (raw.description !== void 0) token.description = raw.description;
    if (resolved.aliasOf !== void 0) token.aliasOf = resolved.aliasOf;
    tokens.push(token);
  }
  if (errors.length > 0) {
    return { kind: "error", errors };
  }
  tokens.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {
    kind: "ok",
    map: { format: "w3c", tokens },
    warnings
  };
}

// src/io/discover-tokens.ts
import { readdir, readFile, stat } from "fs/promises";
import { isAbsolute, join, resolve as resolve3, sep } from "path";
var EXCLUDED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "out",
  ".next"
]);
async function detectFileFormat(absPath) {
  let raw;
  try {
    raw = await readFile(absPath, "utf8");
  } catch {
    return void 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  const format = detectFormat(parsed);
  return format === "unknown" ? void 0 : format;
}
function isConventionalTokenFile(fileName) {
  if (!fileName.endsWith(".json")) return false;
  return fileName === "tokens.json" || fileName === "design-tokens.json" || fileName.endsWith(".tokens.json");
}
function isTokenDir(dirName) {
  return dirName === "tokens" || dirName === "design-tokens";
}
async function collectCandidates(dir, insideTokenDir, acc) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      await collectCandidates(
        full,
        insideTokenDir || isTokenDir(entry.name),
        acc
      );
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".json")) continue;
    if (insideTokenDir || isConventionalTokenFile(entry.name)) {
      acc.add(full);
    }
  }
}
function depthOf(absPath) {
  return absPath.split(sep).filter((segment) => segment.length > 0).length;
}
function compareSources(a, b) {
  const depthDelta = depthOf(a.path) - depthOf(b.path);
  if (depthDelta !== 0) return depthDelta;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}
async function discoverTokenSources(rootDir, options) {
  const root = resolve3(rootDir);
  if (options?.explicit !== void 0) {
    const explicitPath = isAbsolute(options.explicit) ? options.explicit : resolve3(root, options.explicit);
    let isFile = false;
    try {
      isFile = (await stat(explicitPath)).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) return { kind: "explicit-not-found", path: explicitPath };
    const format = await detectFileFormat(explicitPath);
    if (format === void 0) {
      return { kind: "explicit-not-found", path: explicitPath };
    }
    return { kind: "ok", sources: [{ path: explicitPath, format }] };
  }
  const candidatePaths = /* @__PURE__ */ new Set();
  await collectCandidates(root, false, candidatePaths);
  const sources = [];
  for (const candidate of candidatePaths) {
    const format = await detectFileFormat(candidate);
    if (format !== void 0) sources.push({ path: candidate, format });
  }
  sources.sort(compareSources);
  return { kind: "ok", sources };
}

// src/render/terminal/bar-chart.ts
var import_picocolors = __toESM(require_picocolors(), 1);
var colors = import_picocolors.default.createColors(true);
var FULL_BLOCK = "\u2588";
var PARTIAL_BLOCKS = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"];
function displayWidth(value) {
  return [...value].length;
}
function buildBar(fraction, width) {
  const eighths = Math.max(0, Math.round(fraction * width * 8));
  const fullCount = Math.min(Math.floor(eighths / 8), width);
  let bar = FULL_BLOCK.repeat(fullCount);
  const remainder = eighths % 8;
  if (fullCount < width && remainder > 0) {
    bar += PARTIAL_BLOCKS[remainder];
  }
  return bar;
}
function renderBarChart(items, opts) {
  const labelWidth = Math.max(0, ...items.map((i) => displayWidth(i.label)));
  const valueStrings = items.map((i) => String(i.value));
  const valueWidth = Math.max(0, ...valueStrings.map((v) => v.length));
  const max = Math.max(0, ...items.map((i) => i.value));
  return items.map((item, index) => {
    const clamped = Math.max(0, item.value);
    const fraction = max > 0 ? clamped / max : 0;
    const bar = buildBar(fraction, opts.width);
    const renderedBar = opts.color && bar.length > 0 ? colors.cyan(bar) : bar;
    const label = item.label + " ".repeat(labelWidth - displayWidth(item.label));
    const value = (valueStrings[index] ?? "").padStart(valueWidth);
    return `${label} \u2502${renderedBar} ${value}`;
  }).join("\n");
}

// src/render/terminal/severity.ts
var import_picocolors2 = __toESM(require_picocolors(), 1);
var colors2 = import_picocolors2.default.createColors(true);
var PALETTE = {
  error: (s) => colors2.red(s),
  warn: (s) => colors2.yellow(s),
  info: (s) => colors2.cyan(s),
  ok: (s) => colors2.green(s)
};
function severityColor(level, text, opts) {
  if (!opts.color) return text;
  return PALETTE[level](text);
}
var FORCE_OFF = /* @__PURE__ */ new Set(["0", "false"]);
function shouldColor(env, isTTY) {
  const noColor = env.NO_COLOR;
  if (noColor !== void 0 && noColor !== "") return false;
  const force = env.FORCE_COLOR;
  if (force !== void 0 && force !== "" && !FORCE_OFF.has(force)) return true;
  if (env.CI !== void 0 && env.CI !== "") return false;
  return isTTY;
}

// src/render/terminal/table.ts
function isNumericCell(value) {
  const trimmed = value.trim();
  return trimmed !== "" && !Number.isNaN(Number(trimmed));
}
function displayWidth2(value) {
  return [...value].length;
}
function pad(value, width, alignRight) {
  const gap = Math.max(0, width - displayWidth2(value));
  const filler = " ".repeat(gap);
  return alignRight ? filler + value : value + filler;
}
function renderTable(headers, rows, _opts) {
  const columnCount = headers.length;
  const cellAt = (row, column) => row[column] ?? "";
  const widths = [];
  for (let c2 = 0; c2 < columnCount; c2++) {
    let width = displayWidth2(headers[c2] ?? "");
    for (const row of rows) {
      width = Math.max(width, displayWidth2(cellAt(row, c2)));
    }
    widths.push(width);
  }
  const numericColumn = [];
  for (let c2 = 0; c2 < columnCount; c2++) {
    numericColumn.push(
      rows.length > 0 && rows.every((row) => isNumericCell(cellAt(row, c2)))
    );
  }
  const border = (left, mid, right) => left + widths.map((w) => "\u2500".repeat(w + 2)).join(mid) + right;
  const dataRow = (cells, alignNumeric) => `\u2502${cells.map((cell, c2) => {
    const right = alignNumeric && (numericColumn[c2] ?? false);
    return ` ${pad(cell, widths[c2] ?? 0, right)} `;
  }).join("\u2502")}\u2502`;
  const lines = [];
  lines.push(border("\u250C", "\u252C", "\u2510"));
  lines.push(dataRow(headers, false));
  lines.push(border("\u251C", "\u253C", "\u2524"));
  for (const row of rows) {
    lines.push(
      dataRow(
        headers.map((_, c2) => cellAt(row, c2)),
        true
      )
    );
  }
  lines.push(border("\u2514", "\u2534", "\u2518"));
  return lines.join("\n");
}

// src/cli-commands/a11y.ts
var PARSERS = {
  w3c: parseW3c,
  "tokens-studio": parseTokensStudio,
  "style-dictionary": parseStyleDictionary
};
var DEFAULT_MODE = "default";
function fail(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function isPlainObject3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readThemes(source) {
  const raw = source.$themes;
  if (!Array.isArray(raw)) return void 0;
  const themes = [];
  for (const entry of raw) {
    if (!isPlainObject3(entry)) continue;
    const name = entry.name;
    const sets = entry.selectedTokenSets;
    if (typeof name !== "string" || !isPlainObject3(sets)) continue;
    const selected = {};
    for (const [setName, state] of Object.entries(sets)) {
      if (typeof state === "string") selected[setName] = state;
    }
    themes.push({ name, selectedTokenSets: selected });
  }
  return themes.length > 0 ? themes : void 0;
}
function themeSubDocument(source, theme) {
  const sets = Object.entries(theme.selectedTokenSets).filter(([, state]) => state !== "disabled").map(([setName]) => setName).filter((setName) => isPlainObject3(source[setName]));
  const doc = {};
  for (const setName of sets) doc[setName] = source[setName];
  doc.$metadata = { tokenSetOrder: sets };
  return doc;
}
function loadModeMaps(tokenPath) {
  let raw;
  try {
    raw = readFileSync(tokenPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      message: `Could not read token source "${tokenPath}": ${detail}`
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      message: `Token source "${tokenPath}" is not valid JSON: ${detail}`
    };
  }
  const format = detectFormat(parsed);
  if (format === "unknown") {
    return {
      kind: "error",
      message: `Could not detect a supported token format for "${tokenPath}". Expected W3C, Tokens Studio, or Style Dictionary.`
    };
  }
  const themes = format === "tokens-studio" && isPlainObject3(parsed) ? readThemes(parsed) : void 0;
  if (themes !== void 0 && isPlainObject3(parsed)) {
    const modes2 = [];
    for (const theme of themes) {
      const outcome2 = parseTokensStudio(themeSubDocument(parsed, theme));
      if (outcome2.kind === "error") {
        const lines = outcome2.errors.map((e4) => {
          const where = e4.path !== void 0 ? ` (${e4.path})` : "";
          return `  ${e4.code}${where}: ${e4.message}`;
        });
        return {
          kind: "error",
          message: `Failed to parse mode "${theme.name}" of "${tokenPath}":
${lines.join("\n")}`
        };
      }
      modes2.push({ mode: theme.name, map: outcome2.map });
    }
    return { kind: "ok", modes: modes2 };
  }
  const outcome = PARSERS[format](parsed);
  if (outcome.kind === "error") {
    const lines = outcome.errors.map((e4) => {
      const where = e4.path !== void 0 ? ` (${e4.path})` : "";
      return `  ${e4.code}${where}: ${e4.message}`;
    });
    return {
      kind: "error",
      message: `Failed to parse token source "${tokenPath}" as ${format}:
${lines.join("\n")}`
    };
  }
  return { kind: "ok", modes: [{ mode: DEFAULT_MODE, map: outcome.map }] };
}
async function resolveTokenPath(target) {
  const abs2 = resolve4(target);
  if (!existsSync(abs2)) {
    return { kind: "error", message: `Path "${abs2}" does not exist.` };
  }
  if (statSync(abs2).isFile()) return { kind: "ok", path: abs2 };
  const discovered = await discoverTokenSources(abs2);
  if (discovered.kind === "explicit-not-found") {
    return {
      kind: "error",
      message: `No token source found at "${discovered.path}".`
    };
  }
  const first = discovered.sources[0];
  if (first === void 0) {
    return {
      kind: "error",
      message: `No design-token source found under "${abs2}".
Pass a token file directly, or add a conventional token file (tokens.json, design-tokens.json, *.tokens.json).`
    };
  }
  return { kind: "ok", path: first.path };
}
function filterModes(all, modesFlag) {
  if (modesFlag === void 0 || modesFlag.trim() === "") {
    return { kind: "ok", modes: all };
  }
  const requested = modesFlag.split(",").map((m) => m.trim()).filter((m) => m.length > 0);
  const available = new Set(all.map((m) => m.mode));
  const unknown = requested.filter((m) => !available.has(m));
  if (unknown.length > 0) {
    const list = [...available].sort().join(", ");
    return {
      kind: "error",
      message: `Unknown mode(s): ${unknown.join(", ")}. Available modes: ${list || "(none)"}.`
    };
  }
  const keep = new Set(requested);
  return { kind: "ok", modes: all.filter((m) => keep.has(m.mode)) };
}
function statusSeverity(status) {
  switch (status) {
    case "pass":
      return "ok";
    case "fail":
      return "error";
    case "unparseable":
      return "warn";
  }
}
function findingDetail(finding) {
  if (finding.status === "unparseable") {
    return `${finding.foregroundValue} on ${finding.backgroundValue} \u2014 unparseable`;
  }
  const ratio = finding.ratio !== void 0 ? finding.ratio.toFixed(2) : "?";
  const base = `${ratio}:1 (need ${finding.required}:1) \u2014 ${finding.foregroundValue} on ${finding.backgroundValue}`;
  if (finding.suggestion?.kind === "adjusted") {
    return `${base} \u2192 try ${finding.suggestion.value}`;
  }
  if (finding.suggestion?.kind === "none") {
    return `${base} \u2192 no lightness-only fix`;
  }
  return base;
}
function renderTerm(report, color) {
  if (report.findings.length === 0) {
    return "No semantic color pairings found \u2014 nothing to audit.";
  }
  const rows = report.findings.map((finding) => {
    const status = severityColor(
      statusSeverity(finding.status),
      finding.status,
      { color }
    );
    const pair = `${finding.foreground} / ${finding.background}`;
    return [finding.mode, status, pair, findingDetail(finding)];
  });
  const table = renderTable(["mode", "status", "pair", "detail"], rows, {
    color
  });
  const { summary } = report;
  const verdict = summary.failed === 0 && summary.unparseable === 0 ? severityColor(
    "ok",
    `All ${summary.passed} pair(s) meet ${report.level} contrast.`,
    { color }
  ) : severityColor(
    "error",
    `${summary.failed} of ${summary.total} pair(s) fail ${report.level} contrast` + (summary.unparseable > 0 ? ` (${summary.unparseable} unparseable).` : "."),
    { color }
  );
  return [table, "", verdict].join("\n");
}
function modeTallies(report) {
  const byMode = /* @__PURE__ */ new Map();
  for (const finding of report.findings) {
    let tally = byMode.get(finding.mode);
    if (tally === void 0) {
      tally = { mode: finding.mode, passed: 0, failed: 0 };
      byMode.set(finding.mode, tally);
    }
    if (finding.status === "pass") tally.passed += 1;
    else if (finding.status === "fail") tally.failed += 1;
  }
  return [...byMode.values()];
}
function appendA11yHistory(targetDir, report) {
  const stateDir = join2(targetDir, ".ds-bridge");
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "a11y",
    level: report.level,
    modes: modeTallies(report)
  };
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(
    join2(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
async function runA11y(path, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail(`Unknown --format "${options.format}". Expected "term" or "json".`);
    return;
  }
  const level = options.level;
  if (level !== "AA" && level !== "AAA") {
    fail(`Unknown --level "${options.level}". Expected "AA" or "AAA".`);
    return;
  }
  const tokenPath = await resolveTokenPath(path);
  if (tokenPath.kind === "error") {
    fail(tokenPath.message);
    return;
  }
  const loaded = loadModeMaps(tokenPath.path);
  if (loaded.kind === "error") {
    fail(loaded.message);
    return;
  }
  const filtered = filterModes(loaded.modes, options.modes);
  if (filtered.kind === "error") {
    fail(filtered.message);
    return;
  }
  const report = auditContrast(filtered.modes, { level });
  const resolvedTarget = resolve4(path);
  if (existsSync(resolvedTarget) && statSync(resolvedTarget).isDirectory()) {
    appendA11yHistory(resolvedTarget, report);
  }
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
  } else {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(`${renderTerm(report, color)}
`);
  }
  const clean = report.summary.failed === 0 && report.summary.unparseable === 0;
  process.exitCode = clean ? 0 : 1;
}
function registerA11yCommand(program2) {
  program2.command("a11y").description(
    "Audit token-level WCAG contrast over semantic color pairings across modes"
  ).argument(
    "[path]",
    "token file, or a directory to discover a token source in",
    "."
  ).option("--modes <modes>", "comma-separated modes to audit (default: all)").option("--level <level>", "WCAG conformance level: AA | AAA", "AA").option("--format <format>", "output format: term | json", "term").action((path, options) => {
    void runA11y(path, options);
  });
}

// src/cli-commands/badge.ts
import {
  existsSync as existsSync3,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync3,
  statSync as statSync2,
  writeFileSync as writeFileSync2
} from "fs";
import { dirname, join as join4, resolve as resolve5 } from "path";

// src/config.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, renameSync, writeFileSync } from "fs";
import { join as join3 } from "path";

// src/engines/report/catalog.ts
var CATALOG = [
  {
    id: "system-score",
    title: "System score",
    personas: ["owner", "engineering", "design", "consumer"],
    reportDataKey: "systemScore"
  },
  {
    id: "drift-trend",
    title: "Token drift",
    personas: ["owner", "engineering"],
    reportDataKey: "driftTrend"
  },
  {
    id: "lint-summary",
    title: "Lint violations",
    personas: ["engineering"],
    reportDataKey: "lintSummary"
  },
  {
    id: "readiness",
    title: "Handoff readiness",
    personas: ["design"],
    reportDataKey: "readiness"
  },
  {
    id: "parity",
    title: "Component parity",
    personas: ["owner", "design", "consumer"],
    reportDataKey: "parity"
  },
  {
    id: "a11y",
    title: "Contrast (a11y)",
    personas: ["design", "owner"],
    reportDataKey: "a11y"
  },
  {
    id: "impact",
    title: "Change impact",
    personas: ["engineering", "consumer"],
    reportDataKey: "impact"
  }
];
var ALL_ARTIFACT_IDS = CATALOG.map((a) => a.id);
function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows * cols }, () => 0);
  for (let i = 0; i < rows; i++) {
    dist[i * cols] = i;
  }
  for (let j = 0; j < cols; j++) {
    dist[j] = j;
  }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i * cols + j] = Math.min(
        (dist[(i - 1) * cols + j] ?? 0) + 1,
        (dist[i * cols + j - 1] ?? 0) + 1,
        (dist[(i - 1) * cols + j - 1] ?? 0) + substitution
      );
    }
  }
  return dist[rows * cols - 1] ?? 0;
}
function suggestArtifactIds(input, limit = 3) {
  const needle = input.toLowerCase();
  const MAX_DISTANCE = 4;
  return ALL_ARTIFACT_IDS.map((id, index) => ({
    id,
    index,
    prefix: id.startsWith(needle),
    distance: editDistance(needle, id)
  })).filter((c2) => c2.prefix || c2.distance <= MAX_DISTANCE).sort(
    (a, b) => Number(b.prefix) - Number(a.prefix) || a.distance - b.distance || a.index - b.index
  ).slice(0, limit).map((c2) => c2.id);
}
function lookupArtifact(id) {
  const artifact = CATALOG.find((a) => a.id === id);
  if (artifact !== void 0) {
    return { kind: "found", artifact };
  }
  return { kind: "unknown", id, suggestions: suggestArtifactIds(id) };
}

// src/engines/report/score.ts
var DEFAULT_WEIGHTS = {
  drift: 30,
  lint: 30,
  readiness: 20,
  a11y: 20
};
var COMPONENT_ORDER = [
  "drift",
  "lint",
  "readiness",
  "a11y"
];
function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function clamp01(value) {
  return Math.min(100, Math.max(0, value));
}
function roundHalfUp(value) {
  return Math.round(value);
}
function validateWeights(raw) {
  if (raw === void 0 || raw === null) {
    return { kind: "ok", weights: { ...DEFAULT_WEIGHTS } };
  }
  if (typeof raw !== "object") {
    return { kind: "ok", weights: { ...DEFAULT_WEIGHTS } };
  }
  const obj = raw;
  const weights = { ...DEFAULT_WEIGHTS };
  for (const key of Object.keys(obj)) {
    if (!COMPONENT_ORDER.includes(key)) {
      return { kind: "unknown-key", key };
    }
    const typedKey = key;
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { kind: "non-finite", key: typedKey };
    }
    if (value <= 0) {
      return { kind: "non-positive", key: typedKey };
    }
    weights[typedKey] = value;
  }
  return { kind: "ok", weights };
}
function driftScore(r2) {
  const penalty = 25 * asNumber(r2.stale) + 10 * asNumber(r2.missing) + 5 * asNumber(r2.orphan);
  return Math.max(0, 100 - penalty);
}
function lintScore(r2) {
  const byKind = typeof r2.byKind === "object" && r2.byKind !== null ? r2.byKind : {};
  const penalty = 10 * asNumber(byKind.offSystem) + 5 * asNumber(byKind.near) + 2 * asNumber(byKind.exact);
  return Math.max(0, 100 - penalty);
}
function readinessScore(r2) {
  return clamp01(asNumber(r2.score));
}
function a11yScore(r2) {
  const modes2 = Array.isArray(r2.modes) ? r2.modes : [];
  let passed = 0;
  let failed = 0;
  for (const m of modes2) {
    if (typeof m === "object" && m !== null) {
      const mm = m;
      passed += asNumber(mm.passed);
      failed += asNumber(mm.failed);
    }
  }
  const total = passed + failed;
  if (total <= 0) return void 0;
  return 100 * passed / total;
}
function componentKindFor(historyKind) {
  switch (historyKind) {
    case "tokens-check":
      return "drift";
    case "lint":
      return "lint";
    case "handoff":
      return "readiness";
    case "a11y":
      return "a11y";
    default:
      return void 0;
  }
}
function subScore(kind, record) {
  switch (kind) {
    case "drift":
      return driftScore(record);
    case "lint":
      return lintScore(record);
    case "readiness":
      return readinessScore(record);
    case "a11y":
      return a11yScore(record);
  }
}
function combine(latest, weights) {
  const components = [];
  for (const kind of COMPONENT_ORDER) {
    const record = latest[kind];
    if (record === void 0) continue;
    const score = subScore(kind, record);
    if (score === void 0) continue;
    components.push({ kind, score, weight: weights[kind] });
  }
  if (components.length === 0) return void 0;
  const totalWeight = components.reduce((sum, c2) => sum + c2.weight, 0);
  const weightedSum = components.reduce(
    (sum, c2) => sum + c2.score * c2.weight,
    0
  );
  const current = roundHalfUp(weightedSum / totalWeight);
  return { current, components };
}
function combineScore(latest, weights) {
  const combined = combine(latest, weights);
  return combined === void 0 ? void 0 : combined.current;
}
function scoreFromHistory(text, weights) {
  const effectiveWeights = weights ?? DEFAULT_WEIGHTS;
  const entries = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (trimmed === "") continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof record !== "object" || record === null) continue;
    const component = componentKindFor(record.kind);
    if (component === void 0) continue;
    const date = typeof record.at === "string" ? record.at.slice(0, 10) : void 0;
    entries.push({ component, date, record });
  }
  const latestCurrent = {};
  for (const entry of entries) {
    latestCurrent[entry.component] = entry.record;
  }
  const combined = combine(latestCurrent, effectiveWeights);
  if (combined === void 0) {
    return { kind: "no-data" };
  }
  const datedEntries = entries.filter((e4) => e4.date !== void 0);
  const distinctDates = Array.from(
    new Set(datedEntries.map((e4) => e4.date))
  ).sort();
  const trend = [];
  for (const date of distinctDates) {
    const snapshot = {};
    for (const entry of datedEntries) {
      if (entry.date <= date) {
        snapshot[entry.component] = entry.record;
      }
    }
    const score = combineScore(snapshot, effectiveWeights);
    if (score !== void 0) {
      trend.push({ date, score });
    }
  }
  return {
    kind: "ok",
    current: combined.current,
    components: combined.components,
    trend
  };
}

// src/config.ts
var REPORT_STYLES = ["html", "terminal", "both"];
var DEFAULTS = {
  reportStyle: "both",
  readinessThreshold: 80
};
function parseProjectFile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "invalid",
      message: `.ds-bridge.json is not valid JSON: ${detail}`
    };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      kind: "invalid",
      message: ".ds-bridge.json must be a JSON object"
    };
  }
  const obj = raw;
  const values = { hadFigmaToken: "figma_token" in obj };
  if (obj.figma_file_key !== void 0) {
    if (typeof obj.figma_file_key !== "string") {
      return { kind: "invalid", message: "figma_file_key must be a string" };
    }
    values.figmaFileKey = obj.figma_file_key;
  }
  if (obj.token_source !== void 0) {
    if (typeof obj.token_source !== "string") {
      return { kind: "invalid", message: "token_source must be a string" };
    }
    values.tokenSource = obj.token_source;
  }
  if (obj.report_style !== void 0) {
    if (!REPORT_STYLES.includes(obj.report_style)) {
      return {
        kind: "invalid",
        message: `report_style must be one of ${REPORT_STYLES.join(" | ")}, got ${JSON.stringify(obj.report_style)}`
      };
    }
    values.reportStyle = obj.report_style;
  }
  if (obj.readiness_threshold !== void 0) {
    const n = obj.readiness_threshold;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) {
      return {
        kind: "invalid",
        message: `readiness_threshold must be a number between 0 and 100, got ${JSON.stringify(n)}`
      };
    }
    values.readinessThreshold = n;
  }
  if (obj.dashboard_view !== void 0 && obj.dashboard_artifacts !== void 0) {
    return {
      kind: "invalid",
      message: "dashboard_view and dashboard_artifacts are mutually exclusive \u2014 set one, not both"
    };
  }
  if (obj.dashboard_view !== void 0) {
    if (typeof obj.dashboard_view !== "string") {
      return { kind: "invalid", message: "dashboard_view must be a string" };
    }
    values.dashboardView = obj.dashboard_view;
  }
  if (obj.dashboard_artifacts !== void 0) {
    if (!Array.isArray(obj.dashboard_artifacts)) {
      return {
        kind: "invalid",
        message: "dashboard_artifacts must be an array of artifact ids"
      };
    }
    const artifacts = [];
    for (const entry of obj.dashboard_artifacts) {
      if (typeof entry !== "string") {
        return {
          kind: "invalid",
          message: `dashboard_artifacts must contain only strings, got ${JSON.stringify(entry)}`
        };
      }
      const lookup = lookupArtifact(entry);
      if (lookup.kind === "unknown") {
        const hint = lookup.suggestions.length > 0 ? ` \u2014 did you mean ${lookup.suggestions.join(", ")}?` : "";
        return {
          kind: "invalid",
          message: `dashboard_artifacts has an unknown artifact id ${JSON.stringify(entry)}${hint}`
        };
      }
      artifacts.push(lookup.artifact.id);
    }
    values.dashboardArtifacts = artifacts;
  }
  if (obj.score_weights !== void 0) {
    if (typeof obj.score_weights !== "object" || obj.score_weights === null || Array.isArray(obj.score_weights)) {
      return {
        kind: "invalid",
        message: "score_weights must be an object of component \u2192 weight"
      };
    }
    const weights = validateWeights(obj.score_weights);
    switch (weights.kind) {
      case "unknown-key":
        return {
          kind: "invalid",
          message: `score_weights has an unknown key ${JSON.stringify(weights.key)} \u2014 expected drift, lint, readiness or a11y`
        };
      case "non-positive":
        return {
          kind: "invalid",
          message: `score_weights.${weights.key} must be a positive number`
        };
      case "non-finite":
        return {
          kind: "invalid",
          message: `score_weights.${weights.key} must be a finite number`
        };
      case "ok":
        values.scoreWeights = weights.weights;
        break;
    }
  }
  return { kind: "ok", values };
}
function resolveConfig(inputs) {
  const { flags = {}, env = {} } = inputs;
  const warnings = [];
  let project = { hadFigmaToken: false };
  if (inputs.projectFileText !== void 0) {
    const parsed = parseProjectFile(inputs.projectFileText);
    if (parsed.kind === "invalid") {
      return { kind: "invalid-project-file", message: parsed.message };
    }
    project = parsed.values;
  }
  if (project.hadFigmaToken) {
    warnings.push(
      "figma_token in .ds-bridge.json is ignored \u2014 set it via the plugin config dialog or the FIGMA_TOKEN env var, never in a committed file"
    );
  }
  let envThreshold;
  const rawEnvThreshold = env.CLAUDE_PLUGIN_OPTION_READINESS_THRESHOLD;
  if (rawEnvThreshold !== void 0) {
    const n = Number(rawEnvThreshold);
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      envThreshold = n;
    } else {
      warnings.push(
        `CLAUDE_PLUGIN_OPTION_READINESS_THRESHOLD is not a number between 0 and 100 (got ${JSON.stringify(rawEnvThreshold)}) \u2014 ignoring`
      );
    }
  }
  let envReportStyle;
  const rawEnvReportStyle = env.CLAUDE_PLUGIN_OPTION_REPORT_STYLE;
  if (rawEnvReportStyle !== void 0) {
    if (REPORT_STYLES.includes(rawEnvReportStyle)) {
      envReportStyle = rawEnvReportStyle;
    } else {
      warnings.push(
        `CLAUDE_PLUGIN_OPTION_REPORT_STYLE must be one of ${REPORT_STYLES.join(" | ")} (got ${JSON.stringify(rawEnvReportStyle)}) \u2014 ignoring`
      );
    }
  }
  const tokenValue = flags.figmaToken ?? env.CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN ?? env.FIGMA_TOKEN;
  const config = {
    figmaFileKey: flags.figmaFileKey ?? env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY ?? project.figmaFileKey,
    figmaToken: tokenValue !== void 0 && tokenValue !== "" ? { kind: "present", value: tokenValue } : { kind: "missing" },
    tokenSource: flags.tokenSource ?? env.CLAUDE_PLUGIN_OPTION_TOKEN_SOURCE ?? project.tokenSource,
    reportStyle: flags.reportStyle ?? envReportStyle ?? project.reportStyle ?? DEFAULTS.reportStyle,
    readinessThreshold: flags.readinessThreshold ?? envThreshold ?? project.readinessThreshold ?? DEFAULTS.readinessThreshold,
    // Dashboard selection comes only from the project file (SPEC-measure §3:
    // no env vars, no userConfig). The flags > config > `everything` default
    // is applied downstream by resolveView (M0.2), not here.
    dashboardView: project.dashboardView,
    dashboardArtifacts: project.dashboardArtifacts,
    // The merged/validated weights, or undefined when score_weights is absent
    // (callers fall back to the engine defaults in that case).
    scoreWeights: project.scoreWeights
  };
  return { kind: "ok", config, warnings };
}
var PROJECT_FILE_NAME = ".ds-bridge.json";
function writeProjectConfig(dir, patch) {
  const filePath = join3(dir, PROJECT_FILE_NAME);
  let existing = {};
  if (existsSync2(filePath)) {
    const raw = JSON.parse(readFileSync2(filePath, "utf8"));
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      existing = raw;
    }
  }
  const merged = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === void 0) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  const text = `${JSON.stringify(merged, null, 2)}
`;
  const tempPath = join3(dir, `${PROJECT_FILE_NAME}.${process.pid}.tmp`);
  writeFileSync(tempPath, text, "utf8");
  renameSync(tempPath, filePath);
}

// src/render/html/badge.ts
var DEFAULT_LABEL = "ds-bridge";
var LABEL_BG = "#404040";
var TEXT_COLOR = "#ffffff";
var BAND_GREEN = "#16a34a";
var BAND_AMBER = "#d97706";
var BAND_RED = "#dc2626";
var CHAR_WIDTH = 7;
var SEGMENT_PADDING = 10;
var HEIGHT = 20;
var FONT_SIZE = 11;
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function clamp2(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
function roundHalfUp2(value) {
  return Math.round(value);
}
function bandFill(score) {
  if (score >= 90) return BAND_GREEN;
  if (score >= 70) return BAND_AMBER;
  return BAND_RED;
}
function segmentWidth(text) {
  return text.length * CHAR_WIDTH + SEGMENT_PADDING * 2;
}
function renderBadge(input) {
  const label = input.label ?? DEFAULT_LABEL;
  const display = roundHalfUp2(clamp2(input.score, 0, 100));
  const valueText = `${display}/100`;
  const fill = bandFill(display);
  const labelW = segmentWidth(label);
  const valueW = segmentWidth(valueText);
  const totalW = labelW + valueW;
  const safeLabel = escapeXml(label);
  const safeValue = escapeXml(valueText);
  const title = `${label} system score: ${valueText}`;
  const labelMid = labelW / 2;
  const valueMid = labelW + valueW / 2;
  const textY = HEIGHT / 2 + FONT_SIZE / 2 - 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${HEIGHT}" viewBox="0 0 ${totalW} ${HEIGHT}" role="img">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect x="0" y="0" width="${labelW}" height="${HEIGHT}" fill="${LABEL_BG}" />`,
    `<rect x="${labelW}" y="0" width="${valueW}" height="${HEIGHT}" fill="${fill}" />`,
    `<text x="${labelMid}" y="${textY}" text-anchor="middle" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="${FONT_SIZE}">${safeLabel}</text>`,
    `<text x="${valueMid}" y="${textY}" text-anchor="middle" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="${FONT_SIZE}">${safeValue}</text>`,
    "</svg>"
  ].join("");
}

// src/cli-commands/badge.ts
function fail2(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function noDataMessage(historyPath) {
  return [
    `No system-score data in ${historyPath}.`,
    "",
    "The badge is computed by replaying the project history. Populate it first by",
    "running a check that appends a history line, for example:",
    "",
    "  /ds-bridge:ds-lint        \u2014 DS-aware lint violations",
    "  ds-bridge tokens check    \u2014 token drift (token-check)",
    "",
    "Then run `ds-bridge badge` again."
  ].join("\n");
}
function readProjectConfigText(targetDir) {
  const configPath = join4(targetDir, ".ds-bridge.json");
  if (!existsSync3(configPath)) return void 0;
  try {
    return readFileSync3(configPath, "utf8");
  } catch {
    return void 0;
  }
}
function runBadge(path, options) {
  const targetDir = resolve5(path);
  if (!existsSync3(targetDir) || !statSync2(targetDir).isDirectory()) {
    fail2(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const stateDir = join4(targetDir, ".ds-bridge");
  const historyPath = join4(stateDir, "history.jsonl");
  let historyText;
  try {
    historyText = readFileSync3(historyPath, "utf8");
  } catch {
    fail2(noDataMessage(historyPath));
    return;
  }
  const projectFileText = readProjectConfigText(targetDir);
  let scoreWeights;
  if (projectFileText !== void 0) {
    const resolved = resolveConfig({ projectFileText });
    if (resolved.kind !== "ok") {
      fail2(resolved.message);
      return;
    }
    scoreWeights = resolved.config.scoreWeights;
  }
  const outcome = scoreFromHistory(historyText, scoreWeights);
  if (outcome.kind === "no-data") {
    fail2(noDataMessage(historyPath));
    return;
  }
  const svg = renderBadge({ score: outcome.current });
  const outPath = options.out !== void 0 ? resolve5(options.out) : join4(stateDir, "badge.svg");
  try {
    mkdirSync2(dirname(outPath), { recursive: true });
    writeFileSync2(outPath, svg, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail2(`Could not write badge to "${outPath}": ${detail}`);
    return;
  }
  process.stdout.write(`${outPath}
`);
  process.exitCode = 0;
}
function registerBadgeCommand(program2) {
  program2.command("badge").description(
    "Render a self-contained system-score SVG badge from the project history"
  ).argument("[path]", "project directory to badge", ".").option("--out <file>", "output file (default <path>/.ds-bridge/badge.svg)").action((path, options) => {
    runBadge(path, options);
  });
}

// src/cli-commands/changelog.ts
import { cwd as processCwd } from "process";

// src/engines/changelog/aggregate.ts
var SOURCE_ORDER = {
  figma: 0,
  code: 1,
  tokens: 2
};
var SEVERITY_ORDER = {
  breaking: 0,
  notable: 1,
  minor: 2
};
var CONVENTIONAL_HEADER = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
function toIso(value) {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  return new Date(ms).toISOString();
}
function withinSince(dateIso, since) {
  const at = Date.parse(dateIso);
  const from = Date.parse(since);
  if (Number.isNaN(at) || Number.isNaN(from)) return true;
  return at >= from;
}
function valuePreview(token) {
  const { value } = token;
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  return JSON.stringify(value);
}
function fromDiffEntry(entry, dateIso) {
  const severity = entry.impact === "breaking" ? "breaking" : "notable";
  switch (entry.kind) {
    case "added":
      return {
        id: `tokens:added:${entry.token.name}`,
        dateIso,
        source: "tokens",
        audience: "both",
        severity,
        title: `Token added: ${entry.token.name}`,
        detail: `${entry.token.type} = ${valuePreview(entry.token)}`
      };
    case "removed":
      return {
        id: `tokens:removed:${entry.token.name}`,
        dateIso,
        source: "tokens",
        audience: "both",
        severity,
        title: `Token removed: ${entry.token.name}`,
        detail: `was ${entry.token.type} = ${valuePreview(entry.token)}`
      };
    case "renamed":
      return {
        id: `tokens:renamed:${entry.from.name}->${entry.to.name}`,
        dateIso,
        source: "tokens",
        audience: "both",
        severity,
        title: `Token renamed: ${entry.from.name} \u2192 ${entry.to.name}`,
        detail: `${entry.to.type} = ${valuePreview(entry.to)}`
      };
    case "value-changed":
      return {
        id: `tokens:value-changed:${entry.after.name}`,
        dateIso,
        source: "tokens",
        audience: "both",
        severity,
        title: `Token changed: ${entry.after.name}`,
        detail: `${valuePreview(entry.before)} \u2192 ${valuePreview(entry.after)}`
      };
    case "meta-changed": {
      const meta = entry.after.description ?? entry.after.group;
      return withDetail(
        {
          id: `tokens:meta-changed:${entry.after.name}`,
          dateIso,
          source: "tokens",
          audience: "both",
          severity,
          title: `Token metadata changed: ${entry.after.name}`
        },
        meta
      );
    }
  }
}
function withDetail(base, detail) {
  return detail === void 0 ? base : { ...base, detail };
}
function fromCommit(commit) {
  const lines = commit.subject.split("\n");
  const header = (lines[0] ?? "").trim();
  const hasBreakingFooter = /(^|\n)BREAKING CHANGE:/.test(commit.subject);
  const match = CONVENTIONAL_HEADER.exec(header);
  let severity = "minor";
  let title = header;
  if (match) {
    const type = match[1];
    const bang = match[3];
    const subject = match[4] ?? header;
    title = subject;
    if (bang !== void 0 || hasBreakingFooter) {
      severity = "breaking";
    } else if (type === "feat") {
      severity = "notable";
    } else if (type === "fix") {
      severity = "minor";
    } else {
      severity = "minor";
    }
  } else if (hasBreakingFooter) {
    severity = "breaking";
  }
  return {
    id: `code:${commit.hash}`,
    dateIso: toIso(commit.dateIso),
    source: "code",
    audience: "developer",
    severity,
    title,
    detail: commit.author
  };
}
function fromVersion(version) {
  const description = version.description.trim();
  return withDetail(
    {
      id: `figma:${version.id}`,
      dateIso: toIso(version.created_at),
      source: "figma",
      audience: "designer",
      severity: "notable",
      title: version.label.trim()
    },
    description === "" ? void 0 : version.description
  );
}
function compareEntries(a, b) {
  const dateDelta = Date.parse(b.dateIso) - Date.parse(a.dateIso);
  if (dateDelta !== 0) return dateDelta;
  const sourceDelta = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
  if (sourceDelta !== 0) return sourceDelta;
  const sevDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (sevDelta !== 0) return sevDelta;
  if (a.title < b.title) return -1;
  if (a.title > b.title) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function aggregateChangelog(input) {
  const entries = [];
  for (const version of input.versions) {
    if (version.label.trim() === "") continue;
    entries.push(fromVersion(version));
  }
  for (const commit of input.commits) {
    entries.push(fromCommit(commit));
  }
  const tokenDate = toIso(input.since);
  for (const entry of input.tokenDiff.entries) {
    entries.push(fromDiffEntry(entry, tokenDate));
  }
  return entries.filter((entry) => withinSince(entry.dateIso, input.since)).sort(compareEntries);
}

// src/engines/changelog/render-md.ts
var EMPTY = "# Changelog\n\n_No changes in the selected window._\n";
var SECTIONS = [
  { heading: "## For designers", audience: "designer" },
  { heading: "## For developers", audience: "developer" }
];
function badge(severity) {
  return `**[${severity}]**`;
}
function dateKey(entry) {
  return entry.dateIso.slice(0, 10);
}
function escapeInline(text) {
  return text.replace(/([\\*_`])/g, "\\$1");
}
function inSection(entry, sectionAudience) {
  return entry.audience === sectionAudience || entry.audience === "both";
}
function renderItem(entry) {
  const head = `- ${badge(entry.severity)} ${escapeInline(entry.title)}`;
  if (entry.detail === void 0 || entry.detail.trim() === "") return head;
  return `${head} \u2014 ${escapeInline(entry.detail)}`;
}
function renderSection(heading, entries) {
  if (entries.length === 0) return void 0;
  const lines = [heading, ""];
  let currentDate;
  for (const entry of entries) {
    const date = dateKey(entry);
    if (date !== currentDate) {
      if (currentDate !== void 0) lines.push("");
      lines.push(`### ${date}`, "");
      currentDate = date;
    }
    lines.push(renderItem(entry));
  }
  lines.push("");
  return lines.join("\n");
}
function renderChangelogMarkdown(entries, options) {
  const wanted = options.audience;
  const sectionBlocks = [];
  for (const section of SECTIONS) {
    if (wanted !== void 0 && wanted !== "both" && wanted !== section.audience) {
      continue;
    }
    const sectionEntries = entries.filter(
      (entry) => inSection(entry, section.audience)
    );
    const block = renderSection(section.heading, sectionEntries);
    if (block !== void 0) sectionBlocks.push(block);
  }
  if (sectionBlocks.length === 0) return EMPTY;
  return `# Changelog

${sectionBlocks.join("\n")}`;
}

// src/io/figma/client.ts
var DEFAULT_BASE_URL = "https://api.figma.com";
var MAX_RETRIES = 3;
var DEFAULT_RETRY_AFTER_SECONDS = 1;
function defaultSleep(ms) {
  return new Promise((resolve9) => setTimeout(resolve9, ms));
}
function joinIds(ids) {
  return encodeURIComponent(ids.join(","));
}
function parseRetryAfter(headers) {
  const raw = headers.get("Retry-After");
  if (raw === null) return DEFAULT_RETRY_AFTER_SECONDS;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
}
function mentionsScope(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return /scope/i.test(text);
}
function createFigmaClient(options) {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const jitter = options.jitter ?? Math.random;
  const { token } = options;
  const origin = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const BASE_URL = `${origin}/v1`;
  const baseHeaders = { "X-Figma-Token": token };
  async function request(url, init) {
    let lastRetryAfter = DEFAULT_RETRY_AFTER_SECONDS;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(url, init);
      } catch (error) {
        return {
          kind: "network-error",
          message: error instanceof Error ? error.message : String(error)
        };
      }
      const { status } = response;
      if (status === 429) {
        lastRetryAfter = parseRetryAfter(response.headers);
        if (attempt < MAX_RETRIES) {
          await sleep(lastRetryAfter * 1e3 * (1 + jitter()));
          continue;
        }
        return { kind: "rate-limited", retryAfterSeconds: lastRetryAfter };
      }
      if (status === 401) return { kind: "auth-error" };
      if (status === 403) {
        let body;
        try {
          body = await response.json();
        } catch {
          body = await response.text().catch(() => "");
        }
        if (mentionsScope(body)) {
          const message = typeof body === "object" && body !== null && "err" in body && typeof body.err === "string" ? body.err : "Token is missing a required scope.";
          return { kind: "scope-error", message };
        }
        return { kind: "auth-error" };
      }
      if (status === 404) return { kind: "not-found" };
      if (!response.ok) {
        return {
          kind: "network-error",
          message: `Figma API responded with status ${status}.`
        };
      }
      try {
        const data = await response.json();
        return { kind: "ok", data };
      } catch (error) {
        return {
          kind: "network-error",
          message: error instanceof Error ? error.message : String(error)
        };
      }
    }
    return { kind: "rate-limited", retryAfterSeconds: lastRetryAfter };
  }
  function get(url) {
    return request(url, { method: "GET", headers: { ...baseHeaders } });
  }
  return {
    getFile(key) {
      return get(`${BASE_URL}/files/${key}`);
    },
    getFileNodes(key, ids) {
      const url = `${BASE_URL}/files/${key}/nodes?ids=${joinIds(ids)}`;
      return get(url);
    },
    getComponents(key) {
      return get(
        `${BASE_URL}/files/${key}/components`
      );
    },
    getVersions(key) {
      return get(`${BASE_URL}/files/${key}/versions`);
    },
    getComments(key) {
      return get(`${BASE_URL}/files/${key}/comments`);
    },
    postComment(key, message, clientMeta) {
      const body = clientMeta === void 0 ? { message } : { message, client_meta: clientMeta };
      return request(`${BASE_URL}/files/${key}/comments`, {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
    },
    getImages(key, ids, opts) {
      const parts = [`ids=${joinIds(ids)}`];
      if (opts?.format !== void 0) parts.push(`format=${opts.format}`);
      if (opts?.scale !== void 0) parts.push(`scale=${opts.scale}`);
      if (opts?.svg_include_id !== void 0) {
        parts.push(`svg_include_id=${opts.svg_include_id}`);
      }
      return get(
        `${BASE_URL}/images/${key}?${parts.join("&")}`
      );
    }
  };
}

// src/io/git-log.ts
import { spawnSync } from "child_process";
var GIT_LOG_FIELD_SEP = "";
var GIT_LOG_RECORD_SEP = "";
var PRETTY_FORMAT = `--pretty=format:%H${GIT_LOG_FIELD_SEP}%aI${GIT_LOG_FIELD_SEP}%an${GIT_LOG_FIELD_SEP}%B${GIT_LOG_RECORD_SEP}`;
function parseRecord(record) {
  const fields = record.split(GIT_LOG_FIELD_SEP);
  if (fields.length < 4) return void 0;
  const [hash, dateIso, author, ...subjectParts] = fields;
  if (hash === void 0 || hash === "" || dateIso === void 0 || author === void 0) {
    return void 0;
  }
  const subject = subjectParts.join(GIT_LOG_FIELD_SEP).replace(/\n+$/, "");
  return { hash, dateIso, author, subject };
}
function readGitLog(input) {
  const args = ["log", `--since=${input.since}`, PRETTY_FORMAT];
  const run = input.exec(args, input.cwd);
  if (run.error !== void 0) {
    return { kind: "git-unavailable", message: run.error };
  }
  if (run.status !== 0) {
    return { kind: "not-a-repo" };
  }
  const commits = [];
  for (const raw of run.stdout.split(GIT_LOG_RECORD_SEP)) {
    const record = raw.replace(/^\n+/, "");
    if (record.trim() === "") continue;
    const commit = parseRecord(record);
    if (commit !== void 0) commits.push(commit);
  }
  return { kind: "ok", commits };
}
function spawnGitExec(args, cwd3) {
  const run = spawnSync("git", args, { cwd: cwd3, encoding: "utf8" });
  if (run.error !== void 0) {
    return { status: -1, stdout: "", stderr: "", error: run.error.message };
  }
  return {
    status: run.status ?? -1,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? ""
  };
}

// src/cli-commands/changelog.ts
var DEFAULT_FIGMA_API_BASE = "https://api.figma.com";
function defaultSince(now) {
  const ms = now.getTime() - 90 * 24 * 60 * 60 * 1e3;
  return new Date(ms).toISOString().slice(0, 10);
}
var EMPTY_TOKEN_DIFF = { entries: [], unchanged: 0 };
function defaultDeps() {
  return {
    exec: spawnGitExec,
    makeClient: (token) => createFigmaClient({
      token,
      baseUrl: process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE
    }),
    env: process.env,
    cwd: processCwd(),
    now: () => /* @__PURE__ */ new Date(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  };
}
function severityFor(severity) {
  switch (severity) {
    case "breaking":
      return "error";
    case "notable":
      return "warn";
    case "minor":
      return "info";
  }
}
function parseAudience(flag) {
  switch (flag) {
    case "designers":
    case "designer":
      return { kind: "ok", value: "designer" };
    case "developers":
    case "developer":
      return { kind: "ok", value: "developer" };
    case "both":
      return { kind: "ok", value: "both" };
    default:
      return { kind: "error" };
  }
}
function audienceMatches(entry, audience) {
  if (audience === "both") return true;
  return entry.audience === audience || entry.audience === "both";
}
function renderTerm2(entries, audience, color) {
  if (entries.length === 0) {
    return "No changes in the selected window.";
  }
  const lines = [`${entries.length} change(s):`, ""];
  for (const entry of entries) {
    const date = entry.dateIso.slice(0, 10);
    const badge2 = severityColor(severityFor(entry.severity), entry.severity, {
      color
    });
    const tag = `[${entry.source}/${entry.audience}]`;
    const detail = entry.detail !== void 0 ? ` \u2014 ${entry.detail}` : "";
    lines.push(`${date}  ${badge2}  ${tag} ${entry.title}${detail}`);
  }
  if (audience !== "both") {
    lines.unshift(`(audience: ${audience})`, "");
  }
  return lines.join("\n");
}
async function fetchVersions(deps) {
  const resolved = resolveConfig({ env: deps.env });
  if (resolved.kind !== "ok") {
    return { versions: [], note: `Figma side skipped: ${resolved.message}` };
  }
  const { config } = resolved;
  if (config.figmaToken.kind !== "present" || config.figmaFileKey === void 0) {
    return {
      versions: [],
      note: "Figma side skipped (no token / file key configured) \u2014 code + token changes only."
    };
  }
  const client = deps.makeClient(config.figmaToken.value);
  const result = await client.getVersions(config.figmaFileKey);
  if (result.kind !== "ok") {
    return {
      versions: [],
      note: `Figma side skipped (API ${result.kind}) \u2014 code + token changes only.`
    };
  }
  return { versions: result.data.versions };
}
async function runChangelog(options, deps) {
  const format = options.format;
  if (format !== "term" && format !== "json" && format !== "md") {
    deps.stderr(
      `Unknown --format "${options.format}". Expected "term", "json", or "md".
`
    );
    process.exitCode = 2;
    return;
  }
  const audience = parseAudience(options.audience);
  if (audience.kind !== "ok") {
    deps.stderr(
      `Unknown --audience "${options.audience}". Expected "designers", "developers", or "both".
`
    );
    process.exitCode = 2;
    return;
  }
  const since = options.since ?? defaultSince(deps.now());
  const log = readGitLog({ exec: deps.exec, cwd: deps.cwd, since });
  if (log.kind === "git-unavailable") {
    deps.stderr(`Could not run git: ${log.message}
`);
    process.exitCode = 2;
    return;
  }
  if (log.kind === "not-a-repo") {
    deps.stderr(
      `"${deps.cwd}" is not a git repository (or git failed). Run inside a repo.
`
    );
    process.exitCode = 2;
    return;
  }
  const { versions, note } = await fetchVersions(deps);
  if (note !== void 0 && format === "term") {
    deps.stderr(`${note}
`);
  }
  const all = aggregateChangelog({
    versions,
    commits: log.commits,
    tokenDiff: EMPTY_TOKEN_DIFF,
    since
  });
  const entries = all.filter((entry) => audienceMatches(entry, audience.value));
  if (format === "json") {
    deps.stdout(`${JSON.stringify({ since, entries }, null, 2)}
`);
  } else if (format === "md") {
    deps.stdout(renderChangelogMarkdown(entries, { audience: audience.value }));
  } else {
    const color = shouldColor(deps.env, Boolean(process.stdout.isTTY));
    deps.stdout(`${renderTerm2(entries, audience.value, color)}
`);
  }
  process.exitCode = 0;
}
function registerChangelogCommand(program2) {
  program2.command("changelog").description(
    "Audience-segmented changelog from git log, Figma versions, and token changes"
  ).option(
    "--since <date>",
    "include changes since this date (default: 90 days ago)"
  ).option("--audience <who>", "designers | developers | both", "both").option("--format <format>", "output format: term | json | md", "term").action((options) => {
    void runChangelog(options, defaultDeps());
  });
}

// src/cli-commands/dashboard.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "fs";
import { join as join5, resolve as resolvePath } from "path";

// src/engines/report/presets.ts
var PRESETS = {
  owner: ["system-score", "drift-trend", "parity", "a11y"],
  engineering: ["system-score", "lint-summary", "impact", "drift-trend"],
  design: ["system-score", "readiness", "a11y", "parity"],
  consumer: ["system-score", "parity", "impact"],
  everything: [...ALL_ARTIFACT_IDS]
};
var PRESET_NAMES = Object.keys(PRESETS);
function editDistance2(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows * cols }, () => 0);
  for (let i = 0; i < rows; i++) {
    dist[i * cols] = i;
  }
  for (let j = 0; j < cols; j++) {
    dist[j] = j;
  }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i * cols + j] = Math.min(
        (dist[(i - 1) * cols + j] ?? 0) + 1,
        (dist[i * cols + j - 1] ?? 0) + 1,
        (dist[(i - 1) * cols + j - 1] ?? 0) + substitution
      );
    }
  }
  return dist[rows * cols - 1] ?? 0;
}
function suggestViewNames(input, limit = 3) {
  const needle = input.toLowerCase();
  const MAX_DISTANCE = 4;
  return PRESET_NAMES.map((name, index) => ({
    name,
    index,
    prefix: name.startsWith(needle),
    distance: editDistance2(needle, name)
  })).filter((c2) => c2.prefix || c2.distance <= MAX_DISTANCE).sort(
    (a, b) => Number(b.prefix) - Number(a.prefix) || a.distance - b.distance || a.index - b.index
  ).slice(0, limit).map((c2) => c2.name);
}
function isPresetName(value) {
  return Object.hasOwn(PRESETS, value);
}
function resolveSource(selection, source) {
  const view = selection.view;
  const requested = selection.artifacts !== void 0 && selection.artifacts.length > 0 ? selection.artifacts : void 0;
  if (view !== void 0 && requested !== void 0) {
    return { kind: "conflicting-selection", source };
  }
  if (view !== void 0) {
    if (!isPresetName(view)) {
      return {
        kind: "unknown-view",
        view,
        suggestions: suggestViewNames(view)
      };
    }
    return {
      kind: "ok",
      artifacts: [...PRESETS[view]],
      source,
      viewName: view,
      notices: []
    };
  }
  if (requested !== void 0) {
    const seen = /* @__PURE__ */ new Set();
    const ordered = [];
    let duplicates = 0;
    for (const id of requested) {
      const outcome = lookupArtifact(id);
      if (outcome.kind === "unknown") {
        return {
          kind: "unknown-artifact",
          id: outcome.id,
          suggestions: outcome.suggestions
        };
      }
      const resolved = outcome.artifact.id;
      if (seen.has(resolved)) {
        duplicates += 1;
        continue;
      }
      seen.add(resolved);
      ordered.push(resolved);
    }
    const notices = duplicates > 0 ? [
      `Removed ${duplicates} duplicate artifact id${duplicates === 1 ? "" : "s"} from the selection.`
    ] : [];
    return { kind: "ok", artifacts: ordered, source, notices };
  }
  return void 0;
}
function resolveView(flags, projectConfig) {
  const fromFlags = resolveSource(flags, "flags");
  if (fromFlags !== void 0) {
    return fromFlags;
  }
  const fromProject = resolveSource(projectConfig, "project");
  if (fromProject !== void 0) {
    return fromProject;
  }
  return {
    kind: "ok",
    artifacts: [...PRESETS.everything],
    source: "default",
    viewName: "everything",
    notices: []
  };
}

// src/cli-commands/dashboard-wizard.ts
import { createInterface } from "readline/promises";
var LineReader = class {
  queue = [];
  waiting;
  closed = false;
  constructor(rl) {
    rl.on("line", (line) => {
      if (this.waiting !== void 0) {
        const { resolve: resolve9 } = this.waiting;
        this.waiting = void 0;
        resolve9(line);
      } else {
        this.queue.push(line);
      }
    });
    rl.on("close", () => {
      this.closed = true;
      if (this.waiting !== void 0) {
        const { reject } = this.waiting;
        this.waiting = void 0;
        reject(new EofError());
      }
    });
  }
  /** Resolve with the next line, or reject with {@link EofError} at end of input. */
  next() {
    const buffered = this.queue.shift();
    if (buffered !== void 0) return Promise.resolve(buffered);
    if (this.closed) return Promise.reject(new EofError());
    return new Promise((resolve9, reject) => {
      this.waiting = { resolve: resolve9, reject };
    });
  }
};
var EofError = class extends Error {
};
async function ask(reader, output, prompt) {
  output.write(prompt);
  return reader.next();
}
function selectionLine(ids) {
  return ids.length > 0 ? ids.join(", ") : "(empty)";
}
async function pickPreset(reader, output) {
  output.write("Pick a dashboard view:\n");
  PRESET_NAMES.forEach((name, index) => {
    output.write(`  ${index + 1}) ${name}
`);
  });
  for (; ; ) {
    const answer = (await ask(reader, output, "View number: ")).trim();
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= PRESET_NAMES.length) {
      const picked = PRESET_NAMES[n - 1];
      if (picked !== void 0) return picked;
    }
    output.write(
      `Please enter a number between 1 and ${PRESET_NAMES.length}.
`
    );
  }
}
function isYes(answer) {
  const a = answer.trim().toLowerCase();
  return a === "y" || a === "yes";
}
async function customizeLoop(reader, output, start) {
  let selection = [...start];
  for (; ; ) {
    output.write(`Current selection: ${selectionLine(selection)}
`);
    const raw = (await ask(reader, output, "add <id> / remove <id> / done: ")).trim();
    if (raw.toLowerCase() === "done") return selection;
    const [verb, ...rest] = raw.split(/\s+/);
    const target = rest.join("");
    const command = verb?.toLowerCase();
    if (command !== "add" && command !== "remove" || target === "") {
      output.write("Type 'add <id>', 'remove <id>', or 'done'.\n");
      continue;
    }
    const outcome = lookupArtifact(target);
    if (outcome.kind === "unknown") {
      const hint = outcome.suggestions.length > 0 ? ` \u2014 did you mean ${outcome.suggestions.join(", ")}?` : "";
      output.write(`Unknown artifact id "${target}"${hint}
`);
      continue;
    }
    const id = outcome.artifact.id;
    if (command === "add") {
      if (selection.includes(id)) {
        output.write(`"${id}" is already selected \u2014 no change.
`);
      } else {
        selection.push(id);
      }
    } else {
      if (!selection.includes(id)) {
        output.write(`"${id}" is not selected \u2014 no change.
`);
      } else {
        selection = selection.filter((existing) => existing !== id);
      }
    }
  }
}
async function runSetupWizard(deps) {
  const { input, output, cwd: cwd3, isTTY } = deps;
  if (!isTTY) {
    output.write(
      "The setup wizard needs an interactive terminal. Use `ds-bridge dashboard set --view <preset>` (or --artifacts) instead.\n"
    );
    return { exitCode: 2 };
  }
  const rl = createInterface({ input, output });
  const reader = new LineReader(rl);
  try {
    const preset = await pickPreset(reader, output);
    const customize = isYes(
      await ask(reader, output, `Customize the "${preset}" view? (y/N) `)
    );
    let chosen;
    if (customize) {
      const edited = await customizeLoop(reader, output, PRESETS[preset]);
      chosen = { kind: "artifacts", artifacts: edited };
    } else {
      chosen = { kind: "view", view: preset };
    }
    const summary = chosen.kind === "view" ? `preset "${chosen.view}"` : `artifacts ${selectionLine(chosen.artifacts)}`;
    const confirmed = isYes(
      await ask(reader, output, `Save ${summary}? (y/N) `)
    );
    if (!confirmed) {
      output.write("No changes made.\n");
      return { exitCode: 0 };
    }
    if (chosen.kind === "view") {
      writeProjectConfig(cwd3, {
        dashboard_view: chosen.view,
        dashboard_artifacts: void 0
      });
    } else {
      writeProjectConfig(cwd3, {
        dashboard_artifacts: chosen.artifacts,
        dashboard_view: void 0
      });
    }
    output.write(`Saved. Your dashboard view is now ${summary}.
`);
    output.write("Render it now? ds-bridge report --open\n");
    return { exitCode: 0 };
  } catch (error) {
    if (error instanceof EofError) {
      output.write("\nAborted \u2014 no changes made.\n");
      return { exitCode: 2 };
    }
    throw error;
  } finally {
    rl.close();
  }
}

// src/cli-commands/dashboard.ts
function fail3(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
var PROJECT_FILE_NAME2 = ".ds-bridge.json";
function readSelection(targetDir) {
  const configPath = join5(targetDir, PROJECT_FILE_NAME2);
  let projectFileText;
  if (existsSync4(configPath)) {
    try {
      projectFileText = readFileSync4(configPath, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        kind: "error",
        message: `Could not read ${PROJECT_FILE_NAME2} at "${configPath}": ${detail}`
      };
    }
  }
  const resolved = resolveConfig(
    projectFileText !== void 0 ? { projectFileText } : {}
  );
  if (resolved.kind === "invalid-project-file") {
    return { kind: "error", message: resolved.message };
  }
  const { dashboardView, dashboardArtifacts } = resolved.config;
  const projectSelection = {};
  if (dashboardView !== void 0) projectSelection.view = dashboardView;
  if (dashboardArtifacts !== void 0)
    projectSelection.artifacts = dashboardArtifacts;
  const view = resolveView({}, projectSelection);
  if (view.kind === "conflicting-selection") {
    return {
      kind: "error",
      message: "dashboard_view and dashboard_artifacts are mutually exclusive \u2014 set one, not both"
    };
  }
  if (view.kind === "unknown-view") {
    const hint = view.suggestions.length > 0 ? ` \u2014 did you mean ${view.suggestions.join(", ")}?` : "";
    return {
      kind: "error",
      message: `Unknown dashboard_view "${view.view}"${hint}`
    };
  }
  if (view.kind === "unknown-artifact") {
    const hint = view.suggestions.length > 0 ? ` \u2014 did you mean ${view.suggestions.join(", ")}?` : "";
    return {
      kind: "error",
      message: `Unknown artifact id "${view.id}"${hint}`
    };
  }
  return {
    kind: "ok",
    selection: {
      artifacts: view.artifacts,
      enabled: new Set(view.artifacts),
      source: view.source,
      viewName: view.viewName
    }
  };
}
function toListJson(selection) {
  const artifacts = CATALOG.map((meta) => ({
    id: meta.id,
    title: meta.title,
    personas: [...meta.personas],
    enabled: selection.enabled.has(meta.id)
  }));
  const view = { source: selection.source };
  if (selection.viewName !== void 0) view.viewName = selection.viewName;
  return { artifacts, view };
}
function renderTerm3(data) {
  const rows = data.artifacts.map((a) => [
    a.enabled ? "\u2713" : " ",
    a.id,
    a.title,
    a.personas.join(", ")
  ]);
  const table = renderTable(["on", "id", "title", "personas"], rows, {
    color: false
  });
  const viewLabel = data.view.viewName !== void 0 ? `${data.view.viewName} (${data.view.source})` : data.view.source;
  return [`View: ${viewLabel}`, table].join("\n");
}
function runList(path, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail3(`Unknown --format "${options.format}". Expected "term" or "json".`);
    return;
  }
  const targetDir = resolvePath(path);
  const selection = readSelection(targetDir);
  if (selection.kind === "error") {
    fail3(selection.message);
    return;
  }
  const data = toListJson(selection.selection);
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(data, null, 2)}
`);
  } else {
    process.stdout.write(`${renderTerm3(data)}
`);
  }
  process.exitCode = 0;
}
function parseArtifacts(raw) {
  const requested = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (requested.length === 0) {
    return {
      kind: "error",
      message: "--artifacts needs at least one artifact id (comma-separated)."
    };
  }
  const seen = /* @__PURE__ */ new Set();
  const ids = [];
  for (const entry of requested) {
    const outcome = lookupArtifact(entry);
    if (outcome.kind === "unknown") {
      const hint = outcome.suggestions.length > 0 ? ` \u2014 did you mean ${outcome.suggestions.join(", ")}?` : "";
      return {
        kind: "error",
        message: `Unknown artifact id "${entry}"${hint}`
      };
    }
    if (!seen.has(outcome.artifact.id)) {
      seen.add(outcome.artifact.id);
      ids.push(outcome.artifact.id);
    }
  }
  return { kind: "ok", ids };
}
function runSet(path, options) {
  const hasView = options.view !== void 0;
  const hasArtifacts = options.artifacts !== void 0;
  if (hasView && hasArtifacts) {
    fail3("--view and --artifacts are mutually exclusive \u2014 set one, not both.");
    return;
  }
  if (!hasView && !hasArtifacts) {
    fail3(
      "Specify a view or an artifact list: --view <preset> | --artifacts <a,b,\u2026>."
    );
    return;
  }
  const targetDir = resolvePath(path);
  if (hasView) {
    const view = options.view;
    const resolved = resolveView({ view }, {});
    if (resolved.kind === "unknown-view") {
      const hint = resolved.suggestions.length > 0 ? ` \u2014 did you mean ${resolved.suggestions.join(", ")}?` : "";
      fail3(`Unknown view "${view}"${hint}`);
      return;
    }
    writeProjectConfig(targetDir, {
      dashboard_view: view,
      dashboard_artifacts: void 0
    });
    process.stdout.write(`View set to "${view}".
`);
    process.exitCode = 0;
    return;
  }
  const parsed = parseArtifacts(options.artifacts);
  if (parsed.kind === "error") {
    fail3(parsed.message);
    return;
  }
  writeProjectConfig(targetDir, {
    dashboard_artifacts: parsed.ids,
    dashboard_view: void 0
  });
  process.stdout.write(`Artifacts set to ${parsed.ids.join(", ")}.
`);
  process.exitCode = 0;
}
var MATERIALIZE_NOTICE = "Your view is now an explicit list and will not auto-gain future preset artifacts.";
function runEdit(path, rawId, mode) {
  const outcome = lookupArtifact(rawId);
  if (outcome.kind === "unknown") {
    const hint = outcome.suggestions.length > 0 ? ` \u2014 did you mean ${outcome.suggestions.join(", ")}?` : "";
    fail3(`Unknown artifact id "${rawId}"${hint}`);
    return;
  }
  const id = outcome.artifact.id;
  const targetDir = resolvePath(path);
  const current = readSelection(targetDir);
  if (current.kind === "error") {
    fail3(current.message);
    return;
  }
  const wasExplicitList = current.selection.source === "project" && current.selection.viewName === void 0;
  const before = current.selection.artifacts;
  const present = current.selection.enabled.has(id);
  if (mode === "add" && present) {
    process.stdout.write(`"${id}" is already in your view \u2014 no change.
`);
    process.exitCode = 0;
    return;
  }
  if (mode === "remove" && !present) {
    process.stdout.write(`"${id}" is not in your view \u2014 no change.
`);
    process.exitCode = 0;
    return;
  }
  const next = mode === "add" ? [...before, id] : before.filter((existing) => existing !== id);
  writeProjectConfig(targetDir, {
    dashboard_artifacts: next,
    dashboard_view: void 0
  });
  if (!wasExplicitList) {
    process.stdout.write(`${MATERIALIZE_NOTICE}
`);
  }
  const verb = mode === "add" ? "Added" : "Removed";
  process.stdout.write(`${verb} "${id}". View: ${next.join(", ")}.
`);
  process.exitCode = 0;
}
async function runSetup(path) {
  const isTTY = Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
  if (!isTTY) {
    fail3(
      "The setup wizard needs an interactive terminal. Use `ds-bridge dashboard set --view <preset>` (or --artifacts) instead."
    );
    return;
  }
  const targetDir = resolvePath(path);
  const outcome = await runSetupWizard({
    input: process.stdin,
    output: process.stdout,
    cwd: targetDir,
    isTTY
  });
  process.exitCode = outcome.exitCode;
}
function registerDashboardCommand(program2) {
  const dashboard = program2.command("dashboard").description(
    "Compose the report dashboard: list / set / add / remove artifacts"
  );
  dashboard.command("list").description(
    "List the artifact catalog with an enabled marker for the resolved view"
  ).argument("[path]", "project directory holding .ds-bridge.json", ".").option("--format <format>", "output format: term | json", "term").action((path, options) => {
    runList(path, options);
  });
  dashboard.command("set").description(
    "Persist the dashboard view: --view <preset> XOR --artifacts <a,b,\u2026>"
  ).argument("[path]", "project directory holding .ds-bridge.json", ".").option("--view <preset>", "persona preset name").option("--artifacts <ids>", "comma-separated explicit artifact ids").action((path, options) => {
    runSet(path, options);
  });
  dashboard.command("add").description(
    "Add an artifact to the view (materializes the current preset first)"
  ).argument("<artifact>", "artifact id to add").argument("[path]", "project directory holding .ds-bridge.json", ".").action((artifact, path) => {
    runEdit(path, artifact, "add");
  });
  dashboard.command("remove").description(
    "Remove an artifact from the view (materializes the current preset first)"
  ).argument("<artifact>", "artifact id to remove").argument("[path]", "project directory holding .ds-bridge.json", ".").action((artifact, path) => {
    runEdit(path, artifact, "remove");
  });
  dashboard.command("setup").description("Interactive wizard to compose and persist a dashboard view").argument("[path]", "project directory holding .ds-bridge.json", ".").action((path) => {
    void runSetup(path);
  });
}

// src/cli-commands/docs.ts
import {
  existsSync as existsSync5,
  mkdirSync as mkdirSync3,
  readFileSync as readFileSync5,
  statSync as statSync3,
  writeFileSync as writeFileSync3
} from "fs";
import { dirname as dirname2, join as join6, resolve as resolvePath2 } from "path";
import { fileURLToPath } from "url";

// src/engines/docs/merge.ts
function byNameAsc(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function indexCode(code) {
  const byName2 = /* @__PURE__ */ new Map();
  for (const component of code) {
    if (!byName2.has(component.name)) byName2.set(component.name, component);
  }
  return byName2;
}
function indexFigma(figma) {
  const byId = /* @__PURE__ */ new Map();
  for (const model of figma) {
    if (!byId.has(model.nodeId)) byId.set(model.nodeId, model);
  }
  return byId;
}
function resolveCode(importPath, rich, figmaFallbackVariants) {
  if (rich !== void 0) {
    return {
      importPath: rich.importPath,
      props: rich.props,
      variants: rich.variants
    };
  }
  return {
    importPath,
    props: [],
    variants: figmaFallbackVariants ?? {}
  };
}
function mergeComponentDocs(input) {
  const { registry } = input;
  const matches = Array.isArray(registry?.matches) ? registry.matches : [];
  const unmatchedCode = Array.isArray(registry?.unmatchedCode) ? registry.unmatchedCode : [];
  const unmatchedFigma = Array.isArray(registry?.unmatchedFigma) ? registry.unmatchedFigma : [];
  const codeByName = indexCode(input.code);
  const figmaById = indexFigma(input.figma);
  const docs = [];
  for (const match of matches) {
    const richCode = codeByName.get(match.codeName);
    const richFigma = figmaById.get(match.nodeId);
    const description = richFigma?.description ?? "";
    const gaps = [];
    if (description.length === 0) gaps.push("missing-figma-description");
    docs.push({
      name: match.codeName,
      code: resolveCode(match.importPath, richCode),
      figma: { nodeId: match.nodeId, description },
      gaps
    });
  }
  for (const entry of unmatchedCode) {
    const richCode = codeByName.get(entry.name);
    docs.push({
      name: entry.name,
      code: resolveCode(entry.importPath, richCode),
      gaps: ["unmatched-in-figma"]
    });
  }
  for (const entry of unmatchedFigma) {
    const richFigma = figmaById.get(entry.nodeId);
    const description = richFigma?.description ?? "";
    const gaps = ["unmatched-in-code"];
    if (description.length === 0) gaps.push("missing-figma-description");
    docs.push({
      name: entry.name,
      // No code side: surface the figma variant axes so the doc is not empty.
      code: resolveCode("", void 0, richFigma?.variantProps),
      figma: { nodeId: entry.nodeId, description },
      gaps
    });
  }
  docs.sort((a, b) => byNameAsc(a.name, b.name));
  return docs;
}

// src/engines/docs/render-llms.ts
var TOKEN_TYPE_ORDER = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "number",
  "shadow",
  "typography",
  "other"
];
function signature(doc) {
  const parts = doc.code.props.map(
    (prop) => `${prop.name}${prop.required ? "" : "?"}: ${prop.type}`
  );
  return `(${parts.join(", ")})`;
}
function locationOf(doc) {
  if (doc.code.importPath.length > 0) return doc.code.importPath;
  if (doc.figma !== void 0) return `figma:${doc.figma.nodeId}`;
  return "(no source)";
}
function statusTag(doc) {
  if (doc.gaps.length === 0) return "[documented]";
  return `[gaps: ${doc.gaps.join(", ")}]`;
}
function renderTokens(tokens) {
  const total = tokens.tokens.length;
  const head = ["## Tokens", "", `Format: ${tokens.format}`, `Total: ${total}`];
  if (total === 0) {
    return [...head, "", "_No tokens._"].join("\n");
  }
  const counts = /* @__PURE__ */ new Map();
  for (const token of tokens.tokens) {
    counts.set(token.type, (counts.get(token.type) ?? 0) + 1);
  }
  const lines = [];
  for (const type of TOKEN_TYPE_ORDER) {
    const count = counts.get(type);
    if (count !== void 0 && count > 0) lines.push(`- ${type}: ${count}`);
  }
  return [...head, "", ...lines].join("\n");
}
function renderComponents(docs) {
  const head = ["## Components"];
  if (docs.length === 0) {
    return [...head, "", "_No components._"].join("\n");
  }
  const lines = docs.map(
    (doc) => `- ${doc.name}${signature(doc)} \u2014 ${locationOf(doc)} ${statusTag(doc)}`
  );
  return [...head, "", ...lines].join("\n");
}
function renderLlmsTxt(docs, tokens) {
  const sections = [
    "# Design System",
    "> Machine-readable summary of the design system: tokens and components.",
    renderTokens(tokens),
    renderComponents(docs)
  ];
  return `${sections.join("\n\n")}
`;
}

// src/engines/docs/render-mdx.ts
function statusOf(doc) {
  return doc.gaps.length > 0 ? "gaps" : "documented";
}
function escapeCell(text) {
  return text.replace(/\|/g, "\\|");
}
function renderImport(doc) {
  if (doc.code.importPath.length === 0) return void 0;
  return [
    "```tsx",
    `import { ${doc.name} } from "${doc.code.importPath}";`,
    "```"
  ].join("\n");
}
function renderProps(doc) {
  const { props } = doc.code;
  if (props.length === 0) {
    return ["## Props", "", "_No props documented._"].join("\n");
  }
  const rows = props.map(
    (prop) => `| \`${escapeCell(prop.name)}\` | \`${escapeCell(prop.type)}\` | ${prop.required ? "yes" : "no"} |`
  );
  return [
    "## Props",
    "",
    "| Prop | Type | Required |",
    "| --- | --- | --- |",
    ...rows
  ].join("\n");
}
function renderVariants(doc) {
  const axes = Object.keys(doc.code.variants).sort();
  if (axes.length === 0) {
    return ["## Variants", "", "_No variants._"].join("\n");
  }
  const lines = axes.map((axis) => {
    const values = (doc.code.variants[axis] ?? []).map((value) => `\`${value}\``).join(", ");
    return `- **${axis}**: ${values}`;
  });
  return ["## Variants", "", ...lines].join("\n");
}
function renderFigma(doc) {
  const figma = doc.figma;
  if (figma === void 0) return void 0;
  const body = figma.description.length > 0 ? figma.description : "_No Figma description authored._";
  return ["## Figma", "", body, "", `Node: \`${figma.nodeId}\``].join("\n");
}
function explainGap(gap) {
  switch (gap) {
    case "missing-figma-description":
      return "The matched Figma component has no authored description.";
    case "unmatched-in-figma":
      return "The codebase has this component but the Figma library does not publish a match.";
    case "unmatched-in-code":
      return "Figma publishes this component but no code component matches it.";
  }
}
function renderGaps(doc) {
  if (doc.gaps.length === 0) return void 0;
  const lines = doc.gaps.map((gap) => `> - ${explainGap(gap)}`);
  return [
    "> [!WARNING]",
    "> This component has documentation gaps:",
    ...lines
  ].join("\n");
}
function renderComponentMdx(doc) {
  const sections = [
    ["---", `title: ${doc.name}`, `status: ${statusOf(doc)}`, "---"].join("\n"),
    `# ${doc.name}`
  ];
  const importBlock = renderImport(doc);
  if (importBlock !== void 0) sections.push(importBlock);
  sections.push(renderProps(doc));
  sections.push(renderVariants(doc));
  const figmaBlock = renderFigma(doc);
  if (figmaBlock !== void 0) sections.push(figmaBlock);
  const gapsBlock = renderGaps(doc);
  if (gapsBlock !== void 0) sections.push(gapsBlock);
  return `${sections.join("\n\n")}
`;
}

// src/cli-commands/docs.ts
var EMPTY_TOKENS = { format: "w3c", tokens: [] };
var PARSERS2 = {
  w3c: parseW3c,
  "tokens-studio": parseTokensStudio,
  "style-dictionary": parseStyleDictionary
};
function fail4(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function normalizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
async function scanCode(targetDir) {
  const globals = globalThis;
  if (typeof globals.__filename !== "string") {
    const filename = fileURLToPath(import.meta.url);
    globals.__filename = filename;
    globals.__dirname = dirname2(filename);
  }
  const { scanCodeComponents } = await import("./scan-code-XUHRU37J.mjs");
  return scanCodeComponents(targetDir);
}
function loadRegistry(targetDir) {
  const registryPath = join6(targetDir, ".ds-bridge", "registry.json");
  if (!existsSync5(registryPath)) {
    fail4(
      `No registry found at "${registryPath}". Run "ds-bridge registry build" first.`
    );
    return void 0;
  }
  let raw;
  try {
    raw = readFileSync5(registryPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail4(`Could not read registry "${registryPath}": ${detail}`);
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail4(`Registry "${registryPath}" is not valid JSON: ${detail}`);
    return void 0;
  }
}
async function discoverTokens(targetDir) {
  const outcome = await discoverTokenSources(targetDir);
  if (outcome.kind !== "ok" || outcome.sources.length === 0) {
    return EMPTY_TOKENS;
  }
  const source = outcome.sources[0];
  if (source === void 0) return EMPTY_TOKENS;
  let raw;
  try {
    raw = readFileSync5(source.path, "utf8");
  } catch {
    return EMPTY_TOKENS;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_TOKENS;
  }
  const format = detectFormat(parsed);
  if (format === "unknown") return EMPTY_TOKENS;
  const result = PARSERS2[format](parsed);
  return result.kind === "ok" ? result.map : EMPTY_TOKENS;
}
function mdxFileName(component) {
  const safe = component.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safe.length > 0 ? safe : "component"}.mdx`;
}
function hasRegistry(candidate) {
  return existsSync5(
    join6(resolvePath2(candidate), ".ds-bridge", "registry.json")
  );
}
function disambiguate(component, path) {
  if (component !== void 0 && component !== "" && path === "." && !hasRegistry(".") && hasRegistry(component)) {
    return { component: void 0, path: component };
  }
  return { component, path };
}
function renderTerm4(result) {
  const rows = result.pages.map((page) => [
    page.component,
    page.gaps.length === 0 ? "\u2014" : page.gaps.join(", ")
  ]);
  const table = renderTable(["component", "gaps"], rows, { color: false });
  const gapTotal = result.pages.reduce((sum, p4) => sum + p4.gaps.length, 0);
  const heading = `${result.pages.length} pages written to ${result.outDir}`;
  const footer = `llms.txt: ${result.llmsPath} \xB7 ${gapTotal} gaps total`;
  return [heading, "", table, "", footer].join("\n");
}
async function runDocs(rawComponent, rawPath, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail4(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const { component, path } = disambiguate(rawComponent, rawPath);
  const targetDir = resolvePath2(path);
  if (!existsSync5(targetDir) || !statSync3(targetDir).isDirectory()) {
    fail4(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const registry = loadRegistry(targetDir);
  if (registry === void 0) return;
  const code = await scanCode(targetDir);
  const tokens = await discoverTokens(targetDir);
  const allDocs = mergeComponentDocs({ registry, code, figma: [], tokens });
  let docs = allDocs;
  if (component !== void 0 && component !== "") {
    const needle = normalizeName(component);
    docs = allDocs.filter((doc) => normalizeName(doc.name) === needle);
    if (docs.length === 0) {
      const candidates = allDocs.map((doc) => doc.name).join(", ");
      fail4(
        `No component named "${component}" in the registry. Candidates: ${candidates.length > 0 ? candidates : "(none)"}.`
      );
      return;
    }
  }
  const outDir = options.out !== void 0 ? resolvePath2(options.out) : join6(targetDir, ".ds-bridge", "docs");
  try {
    mkdirSync3(outDir, { recursive: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail4(`Could not create output directory "${outDir}": ${detail}`);
    return;
  }
  const pages = [];
  for (const doc of docs) {
    const fileName = mdxFileName(doc.name);
    const pagePath = join6(outDir, fileName);
    try {
      writeFileSync3(pagePath, renderComponentMdx(doc), "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      fail4(`Could not write "${pagePath}": ${detail}`);
      return;
    }
    pages.push({ component: doc.name, path: pagePath, gaps: doc.gaps });
  }
  const llmsPath = join6(outDir, "llms.txt");
  try {
    writeFileSync3(llmsPath, renderLlmsTxt(docs, tokens), "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail4(`Could not write "${llmsPath}": ${detail}`);
    return;
  }
  const result = { outDir, llmsPath, pages };
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
  } else {
    process.stdout.write(`${renderTerm4(result)}
`);
  }
  process.exitCode = 0;
}
function registerDocsCommand(program2) {
  program2.command("docs").description(
    "Generate component MDX docs + llms.txt from the saved registry and tokens"
  ).argument("[component]", "filter to a single component by normalized name").argument(
    "[path]",
    "project directory holding .ds-bridge/registry.json",
    "."
  ).option("--out <dir>", "output directory (default .ds-bridge/docs)").option("--format <format>", "output format: term | json", "term").action(
    (component, path, options) => {
      void runDocs(component, path, options);
    }
  );
}

// src/cli-commands/handoff.ts
import { appendFileSync as appendFileSync2, mkdirSync as mkdirSync4 } from "fs";
import { join as join7 } from "path";
import { cwd } from "process";

// src/engines/handoff/parse-url.ts
var KEY_PATH_TYPES = /* @__PURE__ */ new Set(["file", "design", "proto"]);
function isFigmaHost(host) {
  const lower = host.toLowerCase();
  return lower === "figma.com" || lower.endsWith(".figma.com");
}
function normalizeNodeId(raw) {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  if (value.length === 0) return void 0;
  return value.replace(/-/g, ":");
}
var INVALID = (message) => ({
  kind: "invalid-url",
  message
});
function parseFigmaUrl(url) {
  if (typeof url !== "string") return INVALID("URL must be a string.");
  const trimmed = url.trim();
  if (trimmed.length === 0) return INVALID("URL is empty.");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return INVALID(`Not a parseable URL: "${url}".`);
  }
  if (!isFigmaHost(parsed.hostname)) {
    return INVALID(`Not a figma.com URL: "${url}".`);
  }
  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return INVALID("Figma URL is missing a file key.");
  }
  const [pathType, ...rest] = segments;
  if (pathType === void 0 || !KEY_PATH_TYPES.has(pathType)) {
    return INVALID(`Unsupported Figma URL path "/${pathType ?? ""}".`);
  }
  const keySegment = rest[0];
  if (keySegment === void 0 || keySegment.length === 0) {
    return INVALID("Figma URL is missing a file key.");
  }
  let fileKey = keySegment;
  const branchKey = rest[2];
  if (rest[1] === "branch" && branchKey !== void 0 && branchKey.length > 0) {
    fileKey = branchKey;
  }
  const nodeIdRaw = parsed.searchParams.get("node-id");
  const nodeId = nodeIdRaw === null ? void 0 : normalizeNodeId(nodeIdRaw);
  return nodeId === void 0 ? { kind: "ok", fileKey } : { kind: "ok", fileKey, nodeId };
}

// src/engines/handoff/score.ts
var WEIGHT_BINDING = 40;
var WEIGHT_AUTO_LAYOUT = 25;
var WEIGHT_COMPONENT = 20;
var WEIGHT_NAMING = 15;
var BINDING_DEDUCTION_LIMIT = 10;
var DEFAULT_NAME = /^(Frame|Rectangle|Group|Ellipse|Vector|Text) \d+$/;
var MULTI_WORD_PASCAL = /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/;
var COMPONENT_NOUNS = /* @__PURE__ */ new Set([
  "Button",
  "Chip",
  "Input",
  "Checkbox",
  "Radio",
  "Select",
  "Badge",
  "Avatar",
  "Tooltip",
  "Modal",
  "Dialog",
  "Tab",
  "Tabs",
  "Tag",
  "Switch",
  "Toggle",
  "Dropdown",
  "Menu",
  "Toast",
  "Alert",
  "Accordion",
  "Breadcrumb",
  "Pagination",
  "Slider",
  "Stepper",
  "Spinner"
]);
var FIX_BINDING = "Bind fills/strokes to a variable";
var FIX_AUTO_LAYOUT = "Add auto layout";
var FIX_COMPONENT = "Reattach to the published component or rename";
var FIX_NAMING = "Rename meaningfully";
function isStyleable(node) {
  const hasFills = Array.isArray(node.fills) && node.fills.length > 0;
  const hasStrokes = Array.isArray(node.strokes) && node.strokes.length > 0;
  return hasFills || hasStrokes;
}
function isPaintBound(node) {
  const bound = node.boundVariables;
  if (bound === void 0) return false;
  const fills = bound.fills;
  const strokes = bound.strokes;
  const boundFills = Array.isArray(fills) && fills.length > 0;
  const boundStrokes = Array.isArray(strokes) && strokes.length > 0;
  return boundFills || boundStrokes;
}
function isFrame(node) {
  return node.type === "FRAME";
}
function hasAutoLayout(node) {
  return node.layoutMode !== void 0 && node.layoutMode !== "NONE";
}
function isComponentName(name) {
  return name.includes("/") || MULTI_WORD_PASCAL.test(name) || COMPONENT_NOUNS.has(name);
}
function isDefaultName(name) {
  return DEFAULT_NAME.test(name);
}
function collect3(root) {
  const nodes = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    nodes.push(node);
    const children = node.children;
    if (Array.isArray(children)) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        const child = children[i];
        if (child !== void 0) stack.push(child);
      }
    }
  }
  return nodes;
}
function scoreReadiness(root) {
  const nodes = collect3(root);
  const totalNodes = nodes.length;
  const styleable = nodes.filter(isStyleable);
  const unbound = styleable.filter((n) => !isPaintBound(n));
  const boundCoverage = styleable.length === 0 ? 1 : 1 - unbound.length / styleable.length;
  const frames = nodes.filter(isFrame);
  const framesWithoutAutoLayout = frames.filter((n) => !hasAutoLayout(n));
  const autoLayoutCoverage = frames.length === 0 ? 1 : 1 - framesWithoutAutoLayout.length / frames.length;
  const instanceCount = nodes.filter((n) => n.type === "INSTANCE").length;
  const suspectNodes = nodes.filter(
    (n) => n.type !== "INSTANCE" && isComponentName(n.name)
  );
  const detachedSuspects = suspectNodes.length;
  const componentDenominator = Math.max(1, detachedSuspects + instanceCount);
  const componentRatio = 1 - detachedSuspects / componentDenominator;
  const badNameNodes = nodes.filter((n) => isDefaultName(n.name));
  const badNames = badNameNodes.length;
  const namingRatio = totalNodes === 0 ? 1 : 1 - badNames / totalNodes;
  const deductions = [];
  if (unbound.length > 0) {
    const lost = WEIGHT_BINDING * (unbound.length / styleable.length);
    const perNode = lost / unbound.length;
    const listed = [...unbound].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, BINDING_DEDUCTION_LIMIT);
    for (const node of listed) {
      deductions.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: "var-binding",
        points: perNode,
        fix: FIX_BINDING
      });
    }
  }
  if (framesWithoutAutoLayout.length > 0) {
    const lost = WEIGHT_AUTO_LAYOUT * (framesWithoutAutoLayout.length / frames.length);
    const perNode = lost / framesWithoutAutoLayout.length;
    for (const node of framesWithoutAutoLayout) {
      deductions.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: "auto-layout",
        points: perNode,
        fix: FIX_AUTO_LAYOUT
      });
    }
  }
  if (detachedSuspects > 0) {
    const lost = WEIGHT_COMPONENT * (1 - componentRatio);
    const perNode = lost / detachedSuspects;
    for (const node of suspectNodes) {
      deductions.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: "component",
        points: perNode,
        fix: FIX_COMPONENT
      });
    }
  }
  if (badNames > 0) {
    const lost = WEIGHT_NAMING * (badNames / totalNodes);
    const perNode = lost / badNames;
    for (const node of badNameNodes) {
      deductions.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: "naming",
        points: perNode,
        fix: FIX_NAMING
      });
    }
  }
  deductions.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
  });
  const rawScore = WEIGHT_BINDING * boundCoverage + WEIGHT_AUTO_LAYOUT * autoLayoutCoverage + WEIGHT_COMPONENT * componentRatio + WEIGHT_NAMING * namingRatio;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));
  return {
    score,
    deductions,
    stats: {
      totalNodes,
      boundCoverage,
      autoLayoutCoverage,
      instanceCount,
      detachedSuspects,
      badNames
    }
  };
}

// src/cli-commands/handoff.ts
var DEDUCTION_LIMIT = 10;
var DEFAULT_FIGMA_API_BASE2 = "https://api.figma.com";
var RULE_LABEL = {
  "var-binding": "Variable binding",
  "auto-layout": "Auto layout",
  component: "Component usage",
  naming: "Naming"
};
var HISTORY_DEDUCTION_LIMIT = 3;
function appendHandoffHistory(report, frameName) {
  const stateDir = join7(cwd(), ".ds-bridge");
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "handoff",
    score: report.score,
    frameName,
    deductions: report.deductions.slice(0, HISTORY_DEDUCTION_LIMIT).map((d) => ({ rule: d.rule, points: d.points }))
  };
  mkdirSync4(stateDir, { recursive: true });
  appendFileSync2(
    join7(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
function fail5(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function missingTokenMessage() {
  return [
    "No Figma personal access token configured.",
    "",
    "Set one via the plugin config dialog (stored in the system keychain) or,",
    "for standalone CLI use, export FIGMA_TOKEN with a Dev/Full-seat PAT:",
    "",
    "  export FIGMA_TOKEN=figd_your_token_here",
    "",
    "Create the token at figma.com \u2192 Settings \u2192 Security \u2192 Personal access",
    "tokens, with these scopes:",
    "  file_content:read, library_content:read, file_versions:read,",
    "  file_comments:read, file_comments:write",
    "",
    "Note: the PAT must come from a Dev or Full seat \u2014 a View seat is rate-",
    "limited to roughly a handful of requests per month and cannot be used here."
  ].join("\n");
}
function clientErrorMessage(result) {
  switch (result.kind) {
    case "auth-error":
      return "Figma rejected the token (auth error). Check that FIGMA_TOKEN is a valid Dev/Full-seat personal access token.";
    case "scope-error":
      return `Figma token is missing a required scope: ${result.message}. The token needs file_content:read (and file_comments:write for --comment).`;
    case "not-found":
      return "Figma could not find that file or node. Check the frame URL is correct and the token's account can access the file.";
    case "rate-limited":
      return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited \u2014 use a Dev/Full-seat PAT.`;
    case "network-error":
      return `Could not reach the Figma API: ${result.message}.`;
  }
}
function formatPoints(points) {
  return points.toFixed(1).replace(/\.0$/, "");
}
function ruleSeverity() {
  return "error";
}
function renderTerm5(report, threshold, color) {
  const passed = report.score >= threshold;
  const scoreSeverity = passed ? "ok" : "error";
  const verdict = passed ? "PASS" : "BELOW THRESHOLD";
  const scoreLine = severityColor(
    scoreSeverity,
    `Readiness ${report.score}/100 (threshold ${threshold}) \u2014 ${verdict}`,
    { color }
  );
  const { stats } = report;
  const statsRows = [
    ["nodes", String(stats.totalNodes)],
    ["bound coverage", `${Math.round(stats.boundCoverage * 100)}%`],
    ["auto-layout coverage", `${Math.round(stats.autoLayoutCoverage * 100)}%`],
    ["instances", String(stats.instanceCount)],
    ["detached suspects", String(stats.detachedSuspects)],
    ["default names", String(stats.badNames)]
  ];
  const statsTable = renderTable(["stat", "value"], statsRows, { color });
  const lines = [scoreLine, "", statsTable];
  if (report.deductions.length > 0) {
    const listed = report.deductions.slice(0, DEDUCTION_LIMIT);
    const rows = listed.map((d) => [
      severityColor(ruleSeverity(), RULE_LABEL[d.rule] ?? d.rule, { color }),
      `${d.nodeName} (${d.nodeId})`,
      `-${formatPoints(d.points)}`,
      d.fix
    ]);
    const table = renderTable(["rule", "node", "points", "fix"], rows, {
      color
    });
    lines.push("", `${report.deductions.length} deduction(s):`, table);
    if (report.deductions.length > DEDUCTION_LIMIT) {
      lines.push(`\u2026 ${report.deductions.length - DEDUCTION_LIMIT} more`);
    }
  } else {
    lines.push("", "No deductions \u2014 this frame is handoff-ready.");
  }
  return lines.join("\n");
}
function commentBody(report, threshold) {
  const verdict = report.score >= threshold ? "passes" : "is below";
  const header = `Handoff readiness: ${report.score}/100 \u2014 ${verdict} the ${threshold} threshold.`;
  if (report.deductions.length === 0) {
    return `${header}
No deductions \u2014 this frame is handoff-ready.`;
  }
  const listed = report.deductions.slice(0, DEDUCTION_LIMIT);
  const lines = listed.map(
    (d) => `\u2022 ${RULE_LABEL[d.rule] ?? d.rule} (-${formatPoints(d.points)}): ${d.nodeName} \u2014 ${d.fix}`
  );
  const more = report.deductions.length > DEDUCTION_LIMIT ? [`\u2026 and ${report.deductions.length - DEDUCTION_LIMIT} more`] : [];
  return [header, "Top deductions:", ...lines, ...more].join("\n");
}
function resolveThreshold(flag, configDefault) {
  if (flag === void 0) return { kind: "ok", value: configDefault };
  const n = Number(flag);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return {
      kind: "error",
      message: `--threshold must be a number between 0 and 100 (got ${JSON.stringify(flag)}).`
    };
  }
  return { kind: "ok", value: n };
}
function nodeFromFileNodes(nodes, nodeId) {
  const direct = nodes[nodeId];
  if (direct !== void 0) return direct.document;
  const entries = Object.values(nodes).filter(
    (v) => v !== void 0
  );
  return entries[0]?.document;
}
async function fetchRoot(client, fileKey, nodeId) {
  if (nodeId !== void 0) {
    const result2 = await client.getFileNodes(fileKey, [nodeId]);
    if (result2.kind !== "ok") {
      return { kind: "error", message: clientErrorMessage(result2) };
    }
    const root = nodeFromFileNodes(result2.data.nodes, nodeId);
    if (root === void 0) {
      return {
        kind: "error",
        message: `Figma returned no node for "${nodeId}" in file ${fileKey}.`
      };
    }
    return { kind: "ok", root };
  }
  const result = await client.getFile(fileKey);
  if (result.kind !== "ok") {
    return { kind: "error", message: clientErrorMessage(result) };
  }
  return { kind: "ok", root: result.data.document };
}
async function runHandoff(url, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail5(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const parsed = parseFigmaUrl(url);
  if (parsed.kind !== "ok") {
    fail5(
      `${parsed.message}
Expected a Figma frame URL like https://www.figma.com/design/<key>/<name>?node-id=1-2`
    );
    return;
  }
  const resolved = resolveConfig({ env: process.env });
  if (resolved.kind !== "ok") {
    fail5(resolved.message);
    return;
  }
  for (const warning of resolved.warnings) {
    process.stderr.write(`warning: ${warning}
`);
  }
  const { config } = resolved;
  if (config.figmaToken.kind === "missing") {
    fail5(missingTokenMessage());
    return;
  }
  const threshold = resolveThreshold(
    options.threshold,
    config.readinessThreshold
  );
  if (threshold.kind === "error") {
    fail5(threshold.message);
    return;
  }
  const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE2;
  const client = createFigmaClient({
    token: config.figmaToken.value,
    baseUrl
  });
  const fetched = await fetchRoot(client, parsed.fileKey, parsed.nodeId);
  if (fetched.kind !== "ok") {
    fail5(fetched.message);
    return;
  }
  const report = scoreReadiness(fetched.root);
  if (options.history) {
    appendHandoffHistory(report, fetched.root.name);
  }
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
  } else {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(`${renderTerm5(report, threshold.value, color)}
`);
  }
  if (options.comment) {
    if (!options.yes) {
      process.stderr.write(
        "refusing to comment without --yes (pass --comment --yes to write the summary to Figma)\n"
      );
    } else {
      const clientMeta = parsed.nodeId !== void 0 ? { node_id: parsed.nodeId } : void 0;
      const posted = await client.postComment(
        parsed.fileKey,
        commentBody(report, threshold.value),
        clientMeta
      );
      if (posted.kind !== "ok") {
        process.stderr.write(
          `warning: could not post the Figma comment: ${clientErrorMessage(posted)}
`
        );
      } else {
        process.stdout.write(`Posted Figma comment ${posted.data.id}.
`);
      }
    }
  }
  process.exitCode = report.score >= threshold.value ? 0 : 1;
}
function registerHandoffCommand(program2) {
  program2.command("handoff").description("Score a Figma frame's pre-handoff machine-readability").argument("<url>", "Figma frame URL (file/design/proto, optional node-id)").option(
    "--threshold <n>",
    "readiness gate (0-100); exit 1 below it (default from config, 80)"
  ).option("--format <format>", "output format: term | json", "term").option(
    "--comment",
    "post the score + top deductions as ONE Figma comment (requires --yes)",
    false
  ).option(
    "--yes",
    "confirm writing the --comment to Figma without an interactive prompt",
    false
  ).option(
    "--no-history",
    "do not append a readiness record to .ds-bridge/history.jsonl in the current directory"
  ).action((url, options) => {
    void runHandoff(url, options);
  });
}

// src/cli-commands/impact.ts
import {
  appendFileSync as appendFileSync3,
  existsSync as existsSync6,
  mkdirSync as mkdirSync5,
  readFileSync as readFileSync6,
  writeFileSync as writeFileSync4
} from "fs";
import { dirname as dirname3, join as join8 } from "path";
import { cwd as cwd2, env as processEnv } from "process";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/engines/impact/component-diff.ts
var RENAME_THRESHOLD = 0.5;
function tokenize2(name) {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Za-z])([0-9])/g, "$1 $2").replace(/([0-9])([A-Za-z])/g, "$1 $2");
  const tokens = [];
  for (const part of spaced.split(/[^a-zA-Z0-9]+/)) {
    const token = part.toLowerCase();
    if (token.length > 0) tokens.push(token);
  }
  return tokens;
}
function nameSimilarity(a, b) {
  const setA = new Set(tokenize2(a));
  const setB = new Set(tokenize2(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return 2 * intersection / (setA.size + setB.size);
}
function byNameAsc2(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
var IMPACT_RANK = {
  breaking: 2,
  additive: 1,
  cosmetic: 0
};
function moreSevere(a, b) {
  return IMPACT_RANK[a] >= IMPACT_RANK[b] ? a : b;
}
function diffVariants(before, after) {
  const changes = [];
  const axes = /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const axis of [...axes].sort()) {
    const beforeValues = before[axis];
    const afterValues = after[axis];
    if (beforeValues === void 0 && afterValues !== void 0) {
      changes.push({ axis, kind: "axis-added" });
      continue;
    }
    if (beforeValues !== void 0 && afterValues === void 0) {
      changes.push({ axis, kind: "axis-removed" });
      continue;
    }
    if (beforeValues === void 0 || afterValues === void 0) continue;
    const beforeSet = new Set(beforeValues);
    const afterSet = new Set(afterValues);
    const added = [];
    const removed = [];
    for (const value of afterSet) {
      if (!beforeSet.has(value)) added.push(value);
    }
    for (const value of beforeSet) {
      if (!afterSet.has(value)) removed.push(value);
    }
    for (const value of removed.sort()) {
      changes.push({ axis, kind: "value-removed", value });
    }
    for (const value of added.sort()) {
      changes.push({ axis, kind: "value-added", value });
    }
  }
  return changes;
}
function variantChangeImpact(change) {
  switch (change.kind) {
    case "axis-removed":
    case "value-removed":
      return "breaking";
    case "axis-added":
    case "value-added":
      return "additive";
  }
}
function classifyChanged(before, after) {
  const variantChanges = diffVariants(before.variantProps, after.variantProps);
  const descriptionChanged = before.description !== after.description;
  if (variantChanges.length === 0 && !descriptionChanged) return void 0;
  let impact = "cosmetic";
  for (const change of variantChanges) {
    impact = moreSevere(impact, variantChangeImpact(change));
  }
  return {
    name: after.name,
    nodeId: after.nodeId,
    descriptionChanged,
    variantChanges,
    impact
  };
}
function matchRenames(removedCandidates, addedCandidates) {
  const edges = [];
  for (let b = 0; b < removedCandidates.length; b += 1) {
    const beforeModel = removedCandidates[b];
    if (beforeModel === void 0) continue;
    for (let a = 0; a < addedCandidates.length; a += 1) {
      const afterModel = addedCandidates[a];
      if (afterModel === void 0) continue;
      const score = nameSimilarity(beforeModel.name, afterModel.name);
      if (score >= RENAME_THRESHOLD) {
        edges.push({ beforeIndex: b, afterIndex: a, score });
      }
    }
  }
  edges.sort((x, y) => {
    if (x.score !== y.score) return y.score - x.score;
    const bx = removedCandidates[x.beforeIndex]?.name ?? "";
    const by = removedCandidates[y.beforeIndex]?.name ?? "";
    if (bx !== by) return bx < by ? -1 : 1;
    const ax = addedCandidates[x.afterIndex]?.name ?? "";
    const ay = addedCandidates[y.afterIndex]?.name ?? "";
    return ax < ay ? -1 : ax > ay ? 1 : 0;
  });
  const usedBefore = /* @__PURE__ */ new Set();
  const usedAfter = /* @__PURE__ */ new Set();
  const matches = [];
  for (const edge of edges) {
    if (usedBefore.has(edge.beforeIndex) || usedAfter.has(edge.afterIndex)) {
      continue;
    }
    usedBefore.add(edge.beforeIndex);
    usedAfter.add(edge.afterIndex);
    matches.push(edge);
  }
  return matches;
}
function diffComponents(before, after) {
  const beforeById = /* @__PURE__ */ new Map();
  for (const model of before) {
    if (!beforeById.has(model.nodeId)) beforeById.set(model.nodeId, model);
  }
  const afterById = /* @__PURE__ */ new Map();
  for (const model of after) {
    if (!afterById.has(model.nodeId)) afterById.set(model.nodeId, model);
  }
  const renamed = [];
  const changed = [];
  for (const [nodeId, beforeModel] of beforeById) {
    const afterModel = afterById.get(nodeId);
    if (afterModel === void 0) continue;
    if (beforeModel.name !== afterModel.name) {
      renamed.push({
        fromName: beforeModel.name,
        toName: afterModel.name,
        nodeId,
        fromNodeId: nodeId,
        impact: "breaking"
      });
      continue;
    }
    const change = classifyChanged(beforeModel, afterModel);
    if (change !== void 0) changed.push(change);
  }
  const removedCandidates = [...beforeById.entries()].filter(([id]) => !afterById.has(id)).map(([, model]) => model);
  const addedCandidates = [...afterById.entries()].filter(([id]) => !beforeById.has(id)).map(([, model]) => model);
  const renameMatches = matchRenames(removedCandidates, addedCandidates);
  const matchedBefore = /* @__PURE__ */ new Set();
  const matchedAfter = /* @__PURE__ */ new Set();
  for (const match of renameMatches) {
    matchedBefore.add(match.beforeIndex);
    matchedAfter.add(match.afterIndex);
    const beforeModel = removedCandidates[match.beforeIndex];
    const afterModel = addedCandidates[match.afterIndex];
    if (beforeModel === void 0 || afterModel === void 0) continue;
    renamed.push({
      fromName: beforeModel.name,
      toName: afterModel.name,
      nodeId: afterModel.nodeId,
      fromNodeId: beforeModel.nodeId,
      impact: "breaking"
    });
  }
  const removed = [];
  for (let b = 0; b < removedCandidates.length; b += 1) {
    if (matchedBefore.has(b)) continue;
    const model = removedCandidates[b];
    if (model === void 0) continue;
    removed.push({
      name: model.name,
      nodeId: model.nodeId,
      impact: "breaking"
    });
  }
  const added = [];
  for (let a = 0; a < addedCandidates.length; a += 1) {
    if (matchedAfter.has(a)) continue;
    const model = addedCandidates[a];
    if (model === void 0) continue;
    added.push({ name: model.name, nodeId: model.nodeId, impact: "additive" });
  }
  added.sort(byNameAsc2);
  removed.sort(byNameAsc2);
  renamed.sort(
    (x, y) => x.toName < y.toName ? -1 : x.toName > y.toName ? 1 : 0
  );
  changed.sort(byNameAsc2);
  return { added, removed, renamed, changed };
}

// src/engines/registry/scan-figma.ts
function isString(value) {
  return typeof value === "string";
}
function asString(value) {
  return isString(value) ? value : "";
}
function parseVariantName(name) {
  const props = {};
  if (!name.includes("=")) return props;
  for (const pair of name.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key.length === 0) continue;
    const existing = props[key];
    if (existing === void 0) {
      props[key] = [value];
    } else {
      existing.push(value);
    }
  }
  return props;
}
function normalizeVariantProps(props) {
  const out = {};
  for (const key of Object.keys(props).sort()) {
    const values = props[key] ?? [];
    out[key] = [...new Set(values)].sort();
  }
  return out;
}
function mergeVariantProps(into, from) {
  for (const key of Object.keys(from)) {
    const incoming = from[key] ?? [];
    const existing = into[key];
    if (existing === void 0) {
      into[key] = [...incoming];
    } else {
      existing.push(...incoming);
    }
  }
}
function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function buildPublished(input) {
  const components = input?.meta?.components;
  const ids = /* @__PURE__ */ new Set();
  if (!Array.isArray(components)) return { models: [], ids };
  const sets = /* @__PURE__ */ new Map();
  const standalone = [];
  for (const component of components) {
    const nodeId = asString(component.node_id);
    if (nodeId.length === 0) continue;
    ids.add(nodeId);
    const rawName = asString(component.name);
    const description = asString(component.description);
    const variantProps = parseVariantName(rawName);
    const isVariant = Object.keys(variantProps).length > 0;
    const setName = isString(component.containing_frame?.name) ? component.containing_frame.name : void 0;
    if (isVariant && setName !== void 0) {
      const existing = sets.get(setName);
      if (existing === void 0) {
        sets.set(setName, {
          name: setName,
          nodeId,
          description,
          variantProps: { ...variantProps }
        });
      } else {
        mergeVariantProps(existing.variantProps, variantProps);
        if (compareIds(nodeId, existing.nodeId) < 0) existing.nodeId = nodeId;
        if (existing.description.length === 0 && description.length > 0) {
          existing.description = description;
        }
      }
    } else {
      standalone.push({ name: rawName, nodeId, description, variantProps });
    }
  }
  const models = [];
  for (const acc of [...sets.values(), ...standalone]) {
    models.push({
      name: acc.name,
      nodeId: acc.nodeId,
      description: acc.description,
      variantProps: normalizeVariantProps(acc.variantProps),
      source: "published"
    });
  }
  return { models, ids };
}
function variantPropsFromChildren(children) {
  const props = {};
  if (!Array.isArray(children)) return props;
  for (const child of children) {
    if (child.type !== "COMPONENT") continue;
    mergeVariantProps(props, parseVariantName(asString(child.name)));
  }
  return props;
}
function buildInline(document, publishedIds) {
  if (document === void 0) return [];
  const byId = /* @__PURE__ */ new Map();
  const stack = [document];
  while (stack.length > 0) {
    const node = stack.pop();
    const type = node.type;
    if (type === "COMPONENT_SET" || type === "COMPONENT") {
      const nodeId = asString(node.id);
      if (nodeId.length > 0 && !publishedIds.has(nodeId) && !byId.has(nodeId)) {
        const variantProps = type === "COMPONENT_SET" ? variantPropsFromChildren(node.children) : {};
        byId.set(nodeId, {
          name: asString(node.name),
          nodeId,
          description: asString(node.description),
          variantProps: normalizeVariantProps(variantProps),
          source: "inline"
        });
      }
      if (type === "COMPONENT_SET") continue;
    }
    const children = node.children;
    if (Array.isArray(children)) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        const child = children[i];
        if (child !== void 0) stack.push(child);
      }
    }
  }
  return [...byId.values()];
}
function buildFigmaComponentModel(input) {
  const { models: publishedModels, ids } = buildPublished(input.published);
  const inlineModels = buildInline(input.fileDocument, ids);
  const byId = /* @__PURE__ */ new Map();
  for (const model of publishedModels) {
    if (!byId.has(model.nodeId)) byId.set(model.nodeId, model);
  }
  for (const model of inlineModels) {
    if (!byId.has(model.nodeId)) byId.set(model.nodeId, model);
  }
  return [...byId.values()].sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return compareIds(a.nodeId, b.nodeId);
  });
}

// src/cli-commands/impact.ts
var DEFAULT_FIGMA_API_BASE3 = "https://api.figma.com";
function fail6(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function missingTokenMessage2() {
  return [
    "No Figma personal access token configured.",
    "",
    "Set one via the plugin config dialog (stored in the system keychain) or,",
    "for standalone CLI use, export FIGMA_TOKEN with a Dev/Full-seat PAT:",
    "",
    "  export FIGMA_TOKEN=figd_your_token_here",
    "",
    "The token needs the library_content:read and file_versions:read scopes, and",
    "must come from a Dev or Full seat \u2014 a View seat is rate-limited and cannot",
    "be used here."
  ].join("\n");
}
function missingFileKeyMessage() {
  return [
    "No Figma library file key configured.",
    "",
    "Pass --file-key <key>, set the figma_file_key plugin option, or export it:",
    "",
    "  export CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY=<key>",
    "",
    "The key is the segment after /file/ or /design/ in the library file URL."
  ].join("\n");
}
function clientErrorMessage2(result) {
  switch (result.kind) {
    case "auth-error":
      return "Figma rejected the token (auth error). Check that FIGMA_TOKEN is a valid Dev/Full-seat personal access token.";
    case "scope-error":
      return `Figma token is missing a required scope: ${result.message}. The token needs library_content:read and file_versions:read.`;
    case "not-found":
      return "Figma could not find that file. Check the file key is correct and the token's account can access the library.";
    case "rate-limited":
      return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited \u2014 use a Dev/Full-seat PAT.`;
    case "network-error":
      return `Could not reach the Figma API: ${result.message}.`;
  }
}
function cursorPath() {
  const dataDir = processEnv.CLAUDE_PLUGIN_DATA;
  if (dataDir !== void 0 && dataDir !== "") {
    return join8(dataDir, "impact-cursor.json");
  }
  return join8(cwd2(), ".ds-bridge", "cache", "impact-cursor.json");
}
function readCursor(path) {
  if (!existsSync6(path)) return void 0;
  try {
    const parsed = JSON.parse(readFileSync6(path, "utf8"));
    if (!Array.isArray(parsed.snapshot)) return void 0;
    return parsed;
  } catch {
    return void 0;
  }
}
function writeCursor(path, cursor) {
  try {
    mkdirSync5(dirname3(path), { recursive: true });
    writeFileSync4(path, `${JSON.stringify(cursor, null, 2)}
`, "utf8");
    return true;
  } catch {
    return false;
  }
}
function loadRegistry2() {
  const registryPath = join8(cwd2(), ".ds-bridge", "registry.json");
  if (!existsSync6(registryPath)) return void 0;
  try {
    return JSON.parse(readFileSync6(registryPath, "utf8"));
  } catch {
    return void 0;
  }
}
async function mapChangedUsage(registry, changedFigmaNames) {
  const globals = globalThis;
  if (typeof globals.__filename !== "string") {
    const filename = fileURLToPath2(import.meta.url);
    globals.__filename = filename;
    globals.__dirname = dirname3(filename);
  }
  const { mapUsage } = await import("./usage-OFLQCL5F.mjs");
  return mapUsage({ registry, changedFigmaNames, projectDir: cwd2() });
}
function changedNames(diff) {
  const names = [];
  for (const removed of diff.removed) names.push(removed.name);
  for (const renamed of diff.renamed) names.push(renamed.fromName);
  for (const changed of diff.changed) names.push(changed.name);
  for (const added of diff.added) names.push(added.name);
  return names;
}
function hasBreaking(diff) {
  if (diff.removed.length > 0) return true;
  if (diff.renamed.length > 0) return true;
  return diff.changed.some((c2) => c2.impact === "breaking");
}
function countByImpact(diff) {
  const counts = { breaking: 0, additive: 0, cosmetic: 0 };
  const all = [
    ...diff.added,
    ...diff.removed,
    ...diff.renamed,
    ...diff.changed
  ];
  for (const entry of all) {
    if (entry.impact === "breaking") counts.breaking += 1;
    else if (entry.impact === "additive") counts.additive += 1;
    else counts.cosmetic += 1;
  }
  return counts;
}
function appendImpactHistory(targetDir, diff, usageByName) {
  const stateDir = join8(targetDir, ".ds-bridge");
  let touchedCallSites = 0;
  for (const usage of usageByName.values()) {
    touchedCallSites += usage.usages.length;
  }
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "impact",
    ...countByImpact(diff),
    touchedCallSites
  };
  mkdirSync5(stateDir, { recursive: true });
  appendFileSync3(
    join8(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
function diffRows(diff) {
  const rows = [];
  for (const r2 of diff.removed) {
    rows.push({
      component: r2.name,
      lookupName: r2.name,
      category: "removed",
      impact: r2.impact,
      detail: "component removed from the library"
    });
  }
  for (const r2 of diff.renamed) {
    rows.push({
      component: r2.toName,
      lookupName: r2.fromName,
      category: "renamed",
      impact: r2.impact,
      detail: `renamed from "${r2.fromName}"`
    });
  }
  for (const c2 of diff.changed) {
    const parts = [];
    if (c2.descriptionChanged) parts.push("description changed");
    for (const vc of c2.variantChanges) {
      if (vc.kind === "axis-added") parts.push(`+axis ${vc.axis}`);
      else if (vc.kind === "axis-removed") parts.push(`-axis ${vc.axis}`);
      else if (vc.kind === "value-added") parts.push(`+${vc.axis}=${vc.value}`);
      else parts.push(`-${vc.axis}=${vc.value}`);
    }
    rows.push({
      component: c2.name,
      lookupName: c2.name,
      category: "changed",
      impact: c2.impact,
      detail: parts.join(", ")
    });
  }
  for (const a of diff.added) {
    rows.push({
      component: a.name,
      lookupName: a.name,
      category: "added",
      impact: a.impact,
      detail: "new component"
    });
  }
  const rank = {
    breaking: 0,
    additive: 1,
    cosmetic: 2
  };
  rows.sort((x, y) => {
    const byImpact = (rank[x.impact] ?? 9) - (rank[y.impact] ?? 9);
    return byImpact !== 0 ? byImpact : x.component < y.component ? -1 : x.component > y.component ? 1 : 0;
  });
  return rows;
}
function renderTerm6(diff, usageByName, registryPresent, color) {
  const rows = diffRows(diff);
  if (rows.length === 0) {
    return severityColor(
      "ok",
      "No component changes since the last snapshot.",
      {
        color
      }
    );
  }
  const breaking = hasBreaking(diff);
  const header = severityColor(
    breaking ? "error" : "ok",
    breaking ? `${rows.length} change(s) \u2014 BREAKING changes found.` : `${rows.length} change(s) \u2014 no breaking changes.`,
    { color }
  );
  const tableRows = rows.map((row) => {
    const usage = usageByName.get(row.lookupName);
    const sites = usage?.count ?? 0;
    const touches = registryPresent ? sites > 0 ? `touches ${sites} call site${sites === 1 ? "" : "s"}` : "no call sites" : "\u2014";
    const sev = row.impact === "breaking" ? "error" : row.impact === "additive" ? "warn" : "info";
    return [
      severityColor(sev, row.impact, { color }),
      row.category,
      row.component,
      row.detail,
      touches
    ];
  });
  const table = renderTable(
    ["impact", "category", "component", "detail", "code"],
    tableRows,
    { color }
  );
  const lines = [header, "", table];
  if (!registryPresent) {
    lines.push(
      "",
      'No .ds-bridge/registry.json found \u2014 run "ds-bridge registry build" to map changes to code call sites.'
    );
  }
  return lines.join("\n");
}
async function runImpact(options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail6(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const resolved = resolveConfig({ env: process.env });
  if (resolved.kind !== "ok") {
    fail6(resolved.message);
    return;
  }
  for (const warning of resolved.warnings) {
    process.stderr.write(`warning: ${warning}
`);
  }
  const { config } = resolved;
  if (config.figmaToken.kind === "missing") {
    fail6(missingTokenMessage2());
    return;
  }
  const fileKey = options.fileKey ?? config.figmaFileKey;
  if (fileKey === void 0 || fileKey === "") {
    fail6(missingFileKeyMessage());
    return;
  }
  const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE3;
  const client = createFigmaClient({ token: config.figmaToken.value, baseUrl });
  const componentsResult = await client.getComponents(fileKey);
  if (componentsResult.kind !== "ok") {
    fail6(clientErrorMessage2(componentsResult));
    return;
  }
  const versionsResult = await client.getVersions(fileKey);
  if (versionsResult.kind !== "ok") {
    fail6(clientErrorMessage2(versionsResult));
    return;
  }
  const freshSnapshot = buildFigmaComponentModel({
    published: componentsResult.data
  });
  const newestVersionId = versionsResult.data.versions[0]?.id ?? "";
  const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
  const path = cursorPath();
  const cursor = readCursor(path);
  const haveBaseline = cursor !== void 0 && cursor.fileKey === fileKey;
  const nextCursor = {
    fileKey,
    versionId: newestVersionId,
    capturedAt,
    snapshot: freshSnapshot
  };
  if (!haveBaseline) {
    if (!writeCursor(path, nextCursor)) {
      fail6(`Could not write the impact cursor to "${path}".`);
      return;
    }
    const sinceNote = options.since !== void 0 ? ` (--since ${options.since} noted; v2 diffs against the cached snapshot)` : "";
    if (format === "json") {
      process.stdout.write(
        `${JSON.stringify(
          {
            baseline: true,
            breaking: false,
            fileKey,
            versionId: newestVersionId,
            componentCount: freshSnapshot.length
          },
          null,
          2
        )}
`
      );
    } else {
      process.stdout.write(
        `Captured a baseline snapshot of ${freshSnapshot.length} component(s)${sinceNote}.
Run "ds-bridge impact" again after library changes to see the diff.
`
      );
    }
    process.exitCode = 0;
    return;
  }
  const diff = diffComponents(cursor.snapshot, freshSnapshot);
  const breaking = hasBreaking(diff);
  const registry = loadRegistry2();
  const usageByName = /* @__PURE__ */ new Map();
  if (registry !== void 0) {
    const usages = await mapChangedUsage(registry, changedNames(diff));
    for (const usage of usages) usageByName.set(usage.figmaName, usage);
  }
  if (format === "json") {
    const usageList = [...usageByName.values()];
    process.stdout.write(
      `${JSON.stringify(
        {
          baseline: false,
          breaking,
          fileKey,
          fromVersionId: cursor.versionId,
          toVersionId: newestVersionId,
          diff,
          usage: usageList,
          registryPresent: registry !== void 0
        },
        null,
        2
      )}
`
    );
  } else {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(
      `${renderTerm6(diff, usageByName, registry !== void 0, color)}
`
    );
  }
  appendImpactHistory(cwd2(), diff, usageByName);
  if (!writeCursor(path, nextCursor)) {
    process.stderr.write(
      `warning: could not update the impact cursor at "${path}".
`
    );
  }
  process.exitCode = breaking ? 1 : 0;
}
function registerImpactCommand(program2) {
  program2.command("impact").description(
    "Detect breaking Figma library changes since the last snapshot and map them to code"
  ).option(
    "--since <versionId>",
    "note a baseline version id (v2 diffs against the cached snapshot)"
  ).option("--file-key <key>", "Figma library file key (overrides config)").option("--format <format>", "output format: term | json", "term").action((options) => {
    void runImpact(options);
  });
}

// src/cli-commands/lint.ts
import { spawnSync as spawnSync2 } from "child_process";
import {
  appendFileSync as appendFileSync4,
  existsSync as existsSync7,
  mkdirSync as mkdirSync6,
  readdirSync,
  readFileSync as readFileSync7,
  statSync as statSync4,
  writeFileSync as writeFileSync5
} from "fs";
import { isAbsolute as isAbsolute2, join as join9, relative, resolve as resolve6, sep as sep2 } from "path";

// src/engines/lint/extract.ts
var HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
var COLOR_FN_RE = /\b(?:rgba?|hsla?)\([^)]*\)/i;
var DIM_RE = /-?\d+(?:\.\d+)?(?:px)?/;
var SPACING_PREFIXES = ["padding", "margin", "inset"];
var SPACING_EXACT = /* @__PURE__ */ new Set([
  "gap",
  "row-gap",
  "column-gap",
  "rowGap",
  "columnGap",
  "top",
  "right",
  "bottom",
  "left"
]);
function isSpacingProperty(property) {
  const lower = property.toLowerCase();
  if (SPACING_EXACT.has(property) || SPACING_EXACT.has(lower)) return true;
  for (const prefix of SPACING_PREFIXES) {
    if (lower === prefix || lower.startsWith(prefix)) return true;
  }
  return false;
}
function blankComments(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (let j = i; j < stop; j++) out += text[j] === "\n" ? "\n" : " ";
      i = stop;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}
function* scanValue(value, property) {
  const spacing = isSpacingProperty(property);
  let i = 0;
  while (i < value.length) {
    const rest = value.slice(i);
    if (/^var\s*\(/i.test(rest)) {
      const close = value.indexOf(")", i);
      i = close === -1 ? value.length : close + 1;
      continue;
    }
    const fn5 = COLOR_FN_RE.exec(rest);
    if (fn5 !== null && fn5.index === 0) {
      yield { offset: i, raw: fn5[0], valueKind: "color" };
      i += fn5[0].length;
      continue;
    }
    if (value[i] === "#") {
      const hex2 = HEX_RE.exec(rest);
      if (hex2 !== null && hex2.index === 0) {
        yield { offset: i, raw: hex2[0], valueKind: "color" };
        i += hex2[0].length;
        continue;
      }
    }
    if (spacing && (value[i] === "-" || /\d/.test(value[i] ?? ""))) {
      const prev = value[i - 1] ?? " ";
      if (!/[a-zA-Z0-9.#-]/.test(prev)) {
        const dim = DIM_RE.exec(rest);
        if (dim !== null && dim.index === 0) {
          const px = Number.parseFloat(dim[0]);
          if (Number.isFinite(px) && px !== 0) {
            yield { offset: i, raw: dim[0], valueKind: "dimension" };
          }
          i += dim[0].length;
          continue;
        }
      }
    }
    i += 1;
  }
}
function extractCss(text, lineBase, colBase) {
  const hits = [];
  const cleaned = blankComments(text);
  const lines = cleaned.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? "";
    const colShift = li === 0 ? colBase : 0;
    const decl = /([\w-]+)\s*:\s*([^;}]*)/g;
    let m = decl.exec(line);
    while (m !== null) {
      const property = m[1] ?? "";
      const value = m[2] ?? "";
      const valueStart = m.index + m[0].length - value.length;
      for (const hit of scanValue(value, property)) {
        hits.push({
          line: lineBase + li,
          col: colShift + valueStart + hit.offset + 1,
          raw: hit.raw,
          property,
          valueKind: hit.valueKind
        });
      }
      m = decl.exec(line);
    }
  }
  return hits;
}
function indexToLineCol(source, index) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i++) {
    if (source[i] === "\n") {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, col: index - lineStart + 1 };
}
var STYLE_OBJ_PROP_RE = /([A-Za-z][A-Za-z0-9]*)\s*:\s*("[^"]*"|'[^']*'|[^,}]*)/g;
function extractTsx(source, file) {
  const out = [];
  const styleOpen = /style\s*=\s*\{\{/g;
  let so = styleOpen.exec(source);
  while (so !== null) {
    const bodyStart = so.index + so[0].length;
    const close = source.indexOf("}}", bodyStart);
    const body = source.slice(bodyStart, close === -1 ? source.length : close);
    STYLE_OBJ_PROP_RE.lastIndex = 0;
    let pm = STYLE_OBJ_PROP_RE.exec(body);
    while (pm !== null) {
      const property = pm[1] ?? "";
      const valueCapture = pm[2] ?? "";
      const rawValue = valueCapture.trim();
      const leading = valueCapture.length - valueCapture.trimStart().length;
      const valueIndexInBody = pm.index + pm[0].length - valueCapture.length + leading;
      const absValueIndex = bodyStart + valueIndexInBody;
      const quoted = /^(["'])(.*)\1$/.exec(rawValue);
      if (quoted !== null) {
        const inner = quoted[2] ?? "";
        if (isColorLiteral(inner)) {
          const pos = indexToLineCol(source, absValueIndex);
          out.push({
            file,
            line: pos.line,
            col: pos.col,
            raw: rawValue,
            property,
            valueKind: "color",
            context: "style-object"
          });
        }
      } else if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
        if (isSpacingProperty(property)) {
          const num3 = Number.parseFloat(rawValue);
          if (Number.isFinite(num3) && num3 !== 0) {
            const pos = indexToLineCol(source, absValueIndex);
            out.push({
              file,
              line: pos.line,
              col: pos.col,
              raw: rawValue,
              property,
              valueKind: "dimension",
              context: "style-object"
            });
          }
        }
      }
      pm = STYLE_OBJ_PROP_RE.exec(body);
    }
    so = styleOpen.exec(source);
  }
  const styledOpen = /\bstyled(?:\.[A-Za-z][\w]*|\([^)]*\))\s*`/g;
  let st = styledOpen.exec(source);
  while (st !== null) {
    const backtickIndex = st.index + st[0].length - 1;
    const bodyStart = backtickIndex + 1;
    const close = source.indexOf("`", bodyStart);
    const body = source.slice(bodyStart, close === -1 ? source.length : close);
    const pos = indexToLineCol(source, bodyStart);
    const cssHits = extractCss(body, pos.line, pos.col - 1);
    for (const hit of cssHits) {
      out.push({
        file,
        line: hit.line,
        col: hit.col,
        raw: hit.raw,
        property: hit.property,
        valueKind: hit.valueKind,
        context: "styled-template"
      });
    }
    st = styledOpen.exec(source);
  }
  return out;
}
var HEX_FULL_RE = /^#[0-9a-fA-F]{3,8}$/;
var COLOR_FN_FULL_RE = /^(?:rgba?|hsla?)\([^)]*\)$/i;
function isColorLiteral(value) {
  const v = value.trim();
  return HEX_FULL_RE.test(v) || COLOR_FN_FULL_RE.test(v);
}
function extensionOf(path) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot).toLowerCase();
}
function byLineThenCol(a, b) {
  if (a.line !== b.line) return a.line - b.line;
  return a.col - b.col;
}
function extractLiterals(file) {
  const ext = extensionOf(file.path);
  let result = [];
  try {
    if (ext === ".css" || ext === ".scss") {
      result = extractCss(file.content, 1, 0).map((hit) => ({
        file: file.path,
        line: hit.line,
        col: hit.col,
        raw: hit.raw,
        property: hit.property,
        valueKind: hit.valueKind,
        context: "css-declaration"
      }));
    } else if (ext === ".tsx" || ext === ".jsx") {
      result = extractTsx(file.content, file.path);
    }
  } catch {
    return [];
  }
  return result.sort(byLineThenCol);
}

// src/engines/lint/fix.ts
function isCompositeToken(token) {
  return typeof token.value === "object" && token.value !== null;
}
function toCssVar(token) {
  return `var(--${token.name.replaceAll(".", "-")})`;
}
function quoteOf(raw) {
  const first = raw[0];
  const last = raw[raw.length - 1];
  if (raw.length >= 2 && (first === '"' || first === "'") && first === last) {
    return first;
  }
  return void 0;
}
function replacementFor(literal, token) {
  const cssVar = toCssVar(token);
  if (literal.context !== "style-object") return cssVar;
  const quote = quoteOf(literal.raw);
  if (quote !== void 0) return `${quote}${cssVar}${quote}`;
  return `"${cssVar}"`;
}
function compareEdits(a, b) {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return b.line - a.line;
  return b.col - a.col;
}
function planFixes(findings) {
  const edits = [];
  for (const { literal, match } of findings) {
    if (match.kind !== "exact") continue;
    if (isCompositeToken(match.token)) continue;
    edits.push({
      file: literal.file,
      line: literal.line,
      col: literal.col,
      length: literal.raw.length,
      replacement: replacementFor(literal, match.token)
    });
  }
  return edits.sort(compareEdits);
}
function applyEdits(content, edits) {
  if (edits.length === 0) return content;
  const lines = content.split("\n");
  const byLine = /* @__PURE__ */ new Map();
  for (const edit of edits) {
    const bucket = byLine.get(edit.line);
    if (bucket === void 0) byLine.set(edit.line, [edit]);
    else bucket.push(edit);
  }
  for (const [line, lineEdits] of byLine) {
    const index = line - 1;
    const text = lines[index];
    if (text === void 0) continue;
    let next = text;
    for (const edit of [...lineEdits].sort((a, b) => b.col - a.col)) {
      const start = edit.col - 1;
      if (start < 0 || start > next.length) continue;
      next = next.slice(0, start) + edit.replacement + next.slice(start + edit.length);
    }
    lines[index] = next;
  }
  return lines.join("\n");
}

// src/engines/tokens/normalize.ts
function normalizeColor(raw) {
  if (raw === "") return void 0;
  const parsed = parse_default(raw);
  if (parsed === void 0) return void 0;
  const alpha = parsed.alpha ?? 1;
  return alpha < 1 ? formatHex8(parsed) : formatHex(parsed);
}
var PX_RE = /^(-?\d+(?:\.\d+)?)px$/;
var REM_RE = /^(-?\d+(?:\.\d+)?)rem$/;
var UNITLESS_RE = /^(-?\d+(?:\.\d+)?)$/;
function normalizeDimension(raw, options) {
  const remBase = options?.remBase ?? 16;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { px: raw } : void 0;
  }
  const trimmed = raw.trim();
  const px = PX_RE.exec(trimmed);
  if (px?.[1] !== void 0) return { px: Number(px[1]) };
  const rem = REM_RE.exec(trimmed);
  if (rem?.[1] !== void 0) return { px: Number(rem[1]) * remBase };
  const unitless = UNITLESS_RE.exec(trimmed);
  if (unitless?.[1] !== void 0) return { px: Number(unitless[1]) };
  return void 0;
}

// src/engines/lint/match.ts
var COLOR_NEAR_DELTA_E = 2.5;
var DIMENSION_NEAR_PX = 1;
var NEAR_LIMIT = 3;
function pickPreferred(tokens) {
  if (tokens.length === 0) return void 0;
  const names = new Set(tokens.map((t) => t.name));
  const semantic = tokens.find(
    (t) => t.aliasOf !== void 0 && names.has(t.aliasOf)
  );
  return semantic ?? tokens[0];
}
function aliasRank(token) {
  return token.aliasOf !== void 0 ? 0 : 1;
}
function stripQuotes(raw) {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if (trimmed.length >= 2 && (quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
function matchColor(literal, index, options) {
  const canonical2 = normalizeColor(stripQuotes(literal.raw));
  if (canonical2 === void 0) return { kind: "off-system" };
  const exact = index.byValue.get(canonical2);
  if (exact !== void 0 && exact.length > 0) {
    const token = pickPreferred(exact);
    if (token !== void 0) return { kind: "exact", token };
  }
  const composite = options?.compositeColors?.get(canonical2);
  if (composite !== void 0 && composite.length > 0) {
    const token = pickPreferred(composite);
    if (token !== void 0) return { kind: "exact", token };
  }
  const near = index.nearest(canonical2, {
    maxDeltaE: COLOR_NEAR_DELTA_E,
    limit: NEAR_LIMIT
  });
  if (near.length === 0) return { kind: "off-system" };
  const candidates = near.map((m) => ({ token: m.token, distance: m.deltaE })).sort(
    (a, b) => a.distance !== b.distance ? a.distance - b.distance : aliasRank(a.token) - aliasRank(b.token)
  ).slice(0, NEAR_LIMIT);
  return { kind: "near", candidates };
}
function matchDimension(literal, index) {
  const dim = normalizeDimension(stripQuotes(literal.raw));
  if (dim === void 0) return { kind: "off-system" };
  const bucket = index.byValue.get(`${dim.px}px`);
  if (bucket !== void 0) {
    const exact = bucket.find((t) => t.type === "dimension");
    if (exact !== void 0) return { kind: "exact", token: exact };
  }
  const candidates = [];
  for (const token of index.byName.values()) {
    if (token.type !== "dimension") continue;
    const tokenDim = normalizeDimension(
      typeof token.value === "number" || typeof token.value === "string" ? token.value : Number.NaN
    );
    if (tokenDim === void 0) continue;
    const distance = Math.abs(dim.px - tokenDim.px);
    if (distance === 0 || distance > DIMENSION_NEAR_PX) continue;
    candidates.push({ token, distance });
  }
  if (candidates.length === 0) return { kind: "off-system" };
  candidates.sort(
    (a, b) => a.distance !== b.distance ? a.distance - b.distance : a.token.name < b.token.name ? -1 : a.token.name > b.token.name ? 1 : 0
  );
  return { kind: "near", candidates: candidates.slice(0, NEAR_LIMIT) };
}
function matchLiteral(literal, index, options) {
  return literal.valueKind === "color" ? matchColor(literal, index, options) : matchDimension(literal, index);
}
function buildCompositeColorLookup(tokens) {
  const lookup = /* @__PURE__ */ new Map();
  for (const token of tokens) {
    const { value } = token;
    if (typeof value !== "object" || value === null) continue;
    const inner = value.color;
    if (typeof inner !== "string") continue;
    const canonical2 = normalizeColor(inner);
    if (canonical2 === void 0) continue;
    const bucket = lookup.get(canonical2);
    if (bucket === void 0) {
      lookup.set(canonical2, [token]);
    } else {
      bucket.push(token);
    }
  }
  return lookup;
}

// src/engines/tokens/token-index.ts
function canonicalValueKey(token) {
  const { value } = token;
  if (typeof value === "number") {
    const dim2 = normalizeDimension(value);
    return token.type === "dimension" && dim2 !== void 0 ? `${dim2.px}px` : String(value);
  }
  if (typeof value !== "string") return void 0;
  const color = normalizeColor(value);
  if (color !== void 0) return color;
  const dim = normalizeDimension(value);
  if (dim !== void 0) return `${dim.px}px`;
  return value;
}
var deltaE2000 = differenceCiede2000();
function buildTokenIndex(tokens) {
  const byName2 = /* @__PURE__ */ new Map();
  const byValue = /* @__PURE__ */ new Map();
  const colorTokens = [];
  for (const token of tokens) {
    byName2.set(token.name, token);
    const key = canonicalValueKey(token);
    if (key !== void 0) {
      const bucket = byValue.get(key);
      if (bucket === void 0) {
        byValue.set(key, [token]);
      } else {
        bucket.push(token);
      }
    }
    if (token.type === "color" && typeof token.value === "string") {
      const parsed = parse_default(token.value);
      if (parsed !== void 0) colorTokens.push({ token, parsed });
    }
  }
  return {
    byName: byName2,
    byValue,
    nearest(rawColor, options) {
      const query = parse_default(rawColor);
      if (query === void 0) return [];
      return colorTokens.map(({ token, parsed }) => ({
        token,
        deltaE: deltaE2000(query, parsed)
      })).filter((match) => match.deltaE <= options.maxDeltaE).sort((a, b) => a.deltaE - b.deltaE).slice(0, options.limit);
    }
  };
}

// src/cli-commands/lint.ts
var PARSERS3 = {
  w3c: parseW3c,
  "tokens-studio": parseTokensStudio,
  "style-dictionary": parseStyleDictionary
};
var EXCLUDED_DIRS2 = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  ".next",
  "coverage"
]);
var LINTABLE_EXTENSIONS = [".css", ".scss", ".tsx", ".jsx"];
var KIND_SEVERITY = {
  exact: "error",
  near: "warn",
  "off-system": "info"
};
function countByKind(findings) {
  const byKind = { exact: 0, near: 0, offSystem: 0 };
  for (const finding of findings) {
    if (finding.match.kind === "exact") byKind.exact += 1;
    else if (finding.match.kind === "near") byKind.near += 1;
    else byKind.offSystem += 1;
  }
  return byKind;
}
function appendLintHistory(targetDir, findings) {
  const stateDir = join9(targetDir, ".ds-bridge");
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "lint",
    byKind: countByKind(findings)
  };
  mkdirSync6(stateDir, { recursive: true });
  appendFileSync4(
    join9(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
function hasExtension(name) {
  const lower = name.toLowerCase();
  return LINTABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
function walkLintableFiles(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join9(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS2.has(entry.name)) continue;
      walkLintableFiles(full, acc);
      continue;
    }
    if (entry.isFile() && hasExtension(entry.name)) acc.push(full);
  }
}
function resolveTokenSource(targetDir, flagTokens) {
  if (flagTokens !== void 0) {
    const abs2 = isAbsolute2(flagTokens) ? flagTokens : resolve6(process.cwd(), flagTokens);
    if (!existsSync7(abs2)) {
      return {
        kind: "error",
        message: `Token source "${abs2}" (from --tokens) does not exist.`
      };
    }
    return { kind: "ok", path: abs2 };
  }
  const configPath = join9(targetDir, ".ds-bridge.json");
  if (existsSync7(configPath)) {
    let projectFileText;
    try {
      projectFileText = readFileSync7(configPath, "utf8");
    } catch {
      projectFileText = void 0;
    }
    if (projectFileText !== void 0) {
      const resolved = resolveConfig({ projectFileText });
      if (resolved.kind === "ok" && resolved.config.tokenSource !== void 0) {
        const src = resolved.config.tokenSource;
        const abs2 = isAbsolute2(src) ? src : resolve6(targetDir, src);
        if (existsSync7(abs2)) return { kind: "ok", path: abs2 };
        return {
          kind: "error",
          message: `token_source "${abs2}" from .ds-bridge.json does not exist.`
        };
      }
    }
  }
  const discovered = discoverFirstTokenSource(targetDir);
  if (discovered !== void 0) return { kind: "ok", path: discovered };
  return {
    kind: "error",
    message: `No design-token source found for "${targetDir}".
Pass one with --tokens <file>, set token_source in .ds-bridge.json, or add a conventional token file (tokens.json, design-tokens.json, *.tokens.json).`
  };
}
function discoverFirstTokenSource(root) {
  const candidates = [];
  collectTokenCandidates(root, false, candidates);
  const verified = candidates.filter((path) => detectFileFormat2(path) !== void 0).sort((a, b) => {
    const depth = depthOf2(a) - depthOf2(b);
    return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
  });
  return verified[0];
}
function depthOf2(path) {
  return path.split(sep2).filter((s) => s.length > 0).length;
}
function isConventionalTokenFile2(name) {
  if (!name.endsWith(".json")) return false;
  return name === "tokens.json" || name === "design-tokens.json" || name.endsWith(".tokens.json");
}
function isTokenDir2(name) {
  return name === "tokens" || name === "design-tokens";
}
function collectTokenCandidates(dir, insideTokenDir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join9(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS2.has(entry.name)) continue;
      collectTokenCandidates(
        full,
        insideTokenDir || isTokenDir2(entry.name),
        acc
      );
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    if (insideTokenDir || isConventionalTokenFile2(entry.name)) acc.push(full);
  }
}
function detectFileFormat2(absPath) {
  let raw;
  try {
    raw = readFileSync7(absPath, "utf8");
  } catch {
    return void 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  const format = detectFormat(parsed);
  return format === "unknown" ? void 0 : format;
}
function loadTokenMap(tokenPath) {
  let raw;
  try {
    raw = readFileSync7(tokenPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      message: `Could not read token source "${tokenPath}": ${detail}`
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      message: `Token source "${tokenPath}" is not valid JSON: ${detail}`
    };
  }
  const format = detectFormat(parsed);
  if (format === "unknown") {
    return {
      kind: "error",
      message: `Could not detect a supported token format for "${tokenPath}". Expected W3C, Tokens Studio, or Style Dictionary.`
    };
  }
  const outcome = PARSERS3[format](parsed);
  if (outcome.kind === "error") {
    const lines = outcome.errors.map((e4) => {
      const where = e4.path !== void 0 ? ` (${e4.path})` : "";
      return `  ${e4.code}${where}: ${e4.message}`;
    });
    return {
      kind: "error",
      message: `Failed to parse token source "${tokenPath}" as ${format}:
${lines.join("\n")}`
    };
  }
  return { kind: "ok", map: outcome.map };
}
function lintFile(absPath, relPath, tokens) {
  let content;
  try {
    content = readFileSync7(absPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      message: `Could not read "${absPath}": ${detail}`
    };
  }
  const literals = extractLiterals({ path: relPath, content });
  const findings = [];
  for (const literal of literals) {
    const match = matchLiteral(literal, tokens.index, {
      compositeColors: tokens.compositeColors
    });
    findings.push({ literal, match });
  }
  return { kind: "ok", findings };
}
function candidateNames(match) {
  return match.kind === "near" ? match.candidates.map((candidate) => candidate.token.name) : [];
}
function toJsonFinding(finding) {
  const base = {
    file: finding.literal.file,
    line: finding.literal.line,
    col: finding.literal.col,
    raw: finding.literal.raw,
    property: finding.literal.property,
    kind: finding.match.kind
  };
  if (finding.match.kind === "exact") {
    base.expectedToken = finding.match.token.name;
  } else if (finding.match.kind === "near") {
    base.expectedCandidates = candidateNames(finding.match);
  }
  return base;
}
function suggestionFor(match) {
  switch (match.kind) {
    case "exact":
      return `use token ${match.token.name}`;
    case "near": {
      const names = candidateNames(match).join(", ");
      return `near token(s): ${names}`;
    }
    case "off-system":
      return "no matching token (off-system)";
  }
}
function renderTerm7(findings, color) {
  const blocks = [];
  const byFile = /* @__PURE__ */ new Map();
  for (const finding of findings) {
    const bucket = byFile.get(finding.literal.file);
    if (bucket === void 0) byFile.set(finding.literal.file, [finding]);
    else bucket.push(finding);
  }
  for (const [file, fileFindings] of byFile) {
    const lines = [severityColor("ok", file, { color })];
    for (const finding of fileFindings) {
      const { literal, match } = finding;
      const severity = KIND_SEVERITY[match.kind];
      const position = `${literal.file}:${literal.line}:${literal.col}`;
      const label = severityColor(severity, match.kind, { color });
      lines.push(
        `  ${position}  ${label}  ${literal.property}: ${literal.raw} \u2014 ${suggestionFor(match)}`
      );
    }
    blocks.push(lines.join("\n"));
  }
  const counts = {
    exact: 0,
    near: 0,
    "off-system": 0
  };
  for (const finding of findings) counts[finding.match.kind] += 1;
  const rows = Object.keys(counts).map((kind) => [
    severityColor(KIND_SEVERITY[kind], kind, { color }),
    String(counts[kind])
  ]);
  const table = renderTable(["kind", "count"], rows, { color });
  const total = findings.length;
  const heading = `${total} finding${total === 1 ? "" : "s"}`;
  return [heading, "", ...blocks, "", table].join("\n");
}
function changedFiles(targetDir) {
  const result = spawnSync2("git", ["diff", "--name-only", "HEAD"], {
    cwd: targetDir,
    encoding: "utf8"
  });
  if (result.error !== void 0 || result.status !== 0) {
    return {
      kind: "error",
      message: `Could not list changed files in "${targetDir}" \u2014 not a git repository (or git is unavailable). Run without --changed, or lint inside a repo.`
    };
  }
  const files = new Set(
    result.stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).map((rel2) => resolve6(targetDir, rel2))
  );
  return { kind: "ok", files };
}
function applyFixes(editsByFile) {
  let changed = 0;
  for (const [absPath, edits] of editsByFile) {
    let content;
    try {
      content = readFileSync7(absPath, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        kind: "error",
        message: `Could not read "${absPath}": ${detail}`
      };
    }
    const next = applyEdits(content, edits);
    if (next === content) continue;
    try {
      writeFileSync5(absPath, next, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        kind: "error",
        message: `Could not write "${absPath}": ${detail}`
      };
    }
    changed += 1;
  }
  return { kind: "ok", changed };
}
function lintAll(files, tokens) {
  const all = [];
  for (const file of files) {
    const result = lintFile(file.abs, file.rel, tokens);
    if (result.kind === "error") return result;
    all.push(...result.findings);
  }
  return { kind: "ok", findings: all };
}
function fail7(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function registerLintCommand(program2) {
  program2.command("lint").description("Find raw values that should be design tokens").argument("[path]", "file or directory to lint", ".").option("--fix", "rewrite fixable exact matches to var() in place", false).option("--format <format>", "output format: term | json", "term").option("--tokens <file>", "explicit token source file").option("--changed", "limit to files changed vs git HEAD", false).action((path, options) => {
    const format = options.format;
    if (format !== "json" && format !== "term") {
      fail7(
        `Unknown --format "${options.format}". Expected "json" or "term".`
      );
      return;
    }
    const targetPath = resolve6(path);
    if (!existsSync7(targetPath)) {
      fail7(`Path "${targetPath}" does not exist.`);
      return;
    }
    const stat2 = statSync4(targetPath);
    const isFile = stat2.isFile();
    if (isFile && !hasExtension(targetPath)) {
      fail7(
        `Path "${targetPath}" is not a lintable file (expected ${LINTABLE_EXTENSIONS.join(", ")}).`
      );
      return;
    }
    const targetDir = isFile ? process.cwd() : targetPath;
    const tokenSource = resolveTokenSource(targetDir, options.tokens);
    if (tokenSource.kind === "error") {
      fail7(tokenSource.message);
      return;
    }
    const loaded = loadTokenMap(tokenSource.path);
    if (loaded.kind === "error") {
      fail7(loaded.message);
      return;
    }
    const tokens = {
      map: loaded.map,
      index: buildTokenIndex(loaded.map.tokens),
      compositeColors: buildCompositeColorLookup(loaded.map.tokens)
    };
    const walked = [];
    if (isFile) walked.push(targetPath);
    else walkLintableFiles(targetDir, walked);
    let inScope = walked;
    if (options.changed) {
      const changed = changedFiles(targetDir);
      if (changed.kind === "error") {
        fail7(changed.message);
        return;
      }
      inScope = walked.filter((abs2) => changed.files.has(abs2));
    }
    const files = inScope.map((abs2) => ({ abs: abs2, rel: toRelative(targetDir, abs2) })).sort((a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);
    const linted = lintAll(files, tokens);
    if (linted.kind === "error") {
      fail7(linted.message);
      return;
    }
    if (options.fix) {
      runFix(files, tokens, linted.findings, isFile ? void 0 : targetDir);
      return;
    }
    emitReport(linted.findings, format);
    if (!isFile) appendLintHistory(targetDir, linted.findings);
    process.exitCode = linted.findings.length > 0 ? 1 : 0;
  });
}
function toRelative(targetDir, abs2) {
  const rel2 = relative(targetDir, abs2);
  return rel2.split(sep2).join("/");
}
function emitReport(findings, format) {
  if (format === "json") {
    const json = findings.map(toJsonFinding);
    process.stdout.write(`${JSON.stringify(json, null, 2)}
`);
    return;
  }
  const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
  process.stdout.write(`${renderTerm7(findings, color)}
`);
}
function runFix(files, tokens, findings, historyDir) {
  const relToAbs = new Map(files.map((f3) => [f3.rel, f3.abs]));
  const engineFindings = findings.map((f3) => ({
    literal: f3.literal,
    match: f3.match
  }));
  const edits = planFixes(engineFindings);
  const editsByFile = /* @__PURE__ */ new Map();
  for (const edit of edits) {
    const abs2 = relToAbs.get(edit.file);
    if (abs2 === void 0) continue;
    const bucket = editsByFile.get(abs2);
    if (bucket === void 0) editsByFile.set(abs2, [edit]);
    else bucket.push(edit);
  }
  const applied = applyFixes(editsByFile);
  if (applied.kind === "error") {
    fail7(applied.message);
    return;
  }
  process.stdout.write(
    `Changed ${applied.changed} file${applied.changed === 1 ? "" : "s"}.
`
  );
  const relinted = lintAll(files, tokens);
  if (relinted.kind === "error") {
    fail7(relinted.message);
    return;
  }
  const remaining = relinted.findings.filter((f3) => f3.match.kind !== "exact");
  const stillExact = relinted.findings.filter((f3) => f3.match.kind === "exact");
  const hasRemaining = remaining.length > 0 || stillExact.length > 0;
  if (historyDir !== void 0) {
    appendLintHistory(historyDir, relinted.findings);
  }
  process.exitCode = hasRemaining ? 1 : 0;
}

// src/cli-commands/parity.ts
import { existsSync as existsSync8, readFileSync as readFileSync8, statSync as statSync5 } from "fs";
import { join as join10, resolve as resolvePath3 } from "path";

// src/engines/registry/parity.ts
var OK_THRESHOLD = 0.85;
var SEVERITY_ORDER2 = {
  "missing-in-code": 0,
  "missing-in-figma": 1,
  "prop-mismatch": 2,
  ok: 3
};
function byNameAsc3(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function show(score) {
  if (!Number.isFinite(score)) return "0";
  return String(Math.round(score * 1e3) / 1e3);
}
function buildParity(registry) {
  const matches = Array.isArray(registry?.matches) ? registry.matches : [];
  const unmatchedCode = Array.isArray(registry?.unmatchedCode) ? registry.unmatchedCode : [];
  const unmatchedFigma = Array.isArray(registry?.unmatchedFigma) ? registry.unmatchedFigma : [];
  const rows = [];
  for (const match of matches) {
    const score = typeof match.score === "number" ? match.score : 0;
    if (score >= OK_THRESHOLD) {
      rows.push({
        component: match.codeName,
        status: "ok",
        detail: `Matched ${match.figmaName} (${match.nodeId}) @ ${show(score)}.`
      });
    } else {
      rows.push({
        component: match.codeName,
        status: "prop-mismatch",
        detail: `Matched ${match.figmaName} (${match.nodeId}) @ ${show(score)} \u2014 low shape agreement; props/variants likely diverge.`
      });
    }
  }
  for (const entry of unmatchedFigma) {
    const top = entry.candidates?.[0];
    const detail = top !== void 0 ? `No code component matched ${entry.name} (${entry.nodeId}); closest is ${top.codeName} @ ${show(top.score)}.` : `No code component matched ${entry.name} (${entry.nodeId}); no candidates.`;
    rows.push({
      component: entry.name,
      status: "missing-in-code",
      detail
    });
  }
  for (const entry of unmatchedCode) {
    const top = entry.candidates?.[0];
    const detail = top !== void 0 ? `No Figma component matched ${entry.name} (${entry.importPath}); closest is ${top.figmaName} (${top.nodeId}) @ ${show(top.score)}.` : `No Figma component matched ${entry.name} (${entry.importPath}).`;
    rows.push({
      component: entry.name,
      status: "missing-in-figma",
      detail
    });
  }
  rows.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER2[a.status] - SEVERITY_ORDER2[b.status];
    return bySeverity !== 0 ? bySeverity : byNameAsc3(a.component, b.component);
  });
  const summary = {
    ok: 0,
    missingInCode: 0,
    missingInFigma: 0,
    propMismatch: 0
  };
  for (const row of rows) {
    switch (row.status) {
      case "ok":
        summary.ok += 1;
        break;
      case "missing-in-code":
        summary.missingInCode += 1;
        break;
      case "missing-in-figma":
        summary.missingInFigma += 1;
        break;
      case "prop-mismatch":
        summary.propMismatch += 1;
        break;
    }
  }
  return { rows, summary };
}
function toParitySection(report) {
  return {
    columns: ["Status"],
    rows: report.rows.map((row) => ({
      component: row.component,
      cells: [{ status: row.status }]
    }))
  };
}

// src/cli-commands/parity.ts
function fail8(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function normalizeName2(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function statusSeverity2(status) {
  switch (status) {
    case "ok":
      return "ok";
    case "prop-mismatch":
      return "warn";
    case "missing-in-code":
    case "missing-in-figma":
      return "error";
  }
}
function loadRegistry3(targetDir) {
  const registryPath = join10(targetDir, ".ds-bridge", "registry.json");
  if (!existsSync8(registryPath)) {
    fail8(
      `No registry found at "${registryPath}". Run "ds-bridge registry build" first.`
    );
    return void 0;
  }
  let raw;
  try {
    raw = readFileSync8(registryPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail8(`Could not read registry "${registryPath}": ${detail}`);
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail8(`Registry "${registryPath}" is not valid JSON: ${detail}`);
    return void 0;
  }
}
function filterRows(rows, component) {
  if (component === void 0 || component === "") return rows;
  const needle = normalizeName2(component);
  if (needle === "") return rows;
  return rows.filter((row) => normalizeName2(row.component).includes(needle));
}
function summarize(rows) {
  const summary = {
    ok: 0,
    missingInCode: 0,
    missingInFigma: 0,
    propMismatch: 0
  };
  for (const row of rows) {
    switch (row.status) {
      case "ok":
        summary.ok += 1;
        break;
      case "missing-in-code":
        summary.missingInCode += 1;
        break;
      case "missing-in-figma":
        summary.missingInFigma += 1;
        break;
      case "prop-mismatch":
        summary.propMismatch += 1;
        break;
    }
  }
  return summary;
}
function renderTerm8(report, color) {
  if (report.rows.length === 0) {
    return "No components in the registry \u2014 nothing to compare.";
  }
  const statusWidth = Math.max(
    ...report.rows.map((row) => row.status.length),
    "status".length
  );
  const componentWidth = Math.max(
    ...report.rows.map((row) => row.component.length),
    "component".length
  );
  const lines = [];
  for (const row of report.rows) {
    const status = row.status.padEnd(statusWidth);
    const component = row.component.padEnd(componentWidth);
    const coloredStatus = severityColor(statusSeverity2(row.status), status, {
      color
    });
    lines.push(`${coloredStatus}  ${component}  ${row.detail}`);
  }
  const { summary } = report;
  const bars = renderBarChart(
    [
      { label: "ok", value: summary.ok },
      { label: "prop-mismatch", value: summary.propMismatch },
      { label: "missing-in-code", value: summary.missingInCode },
      { label: "missing-in-figma", value: summary.missingInFigma }
    ],
    { width: 24, color }
  );
  const total = report.rows.length;
  const allOk = total > 0 && summary.ok === total;
  const verdict = allOk ? severityColor("ok", "All components in parity.", { color }) : severityColor(
    "error",
    `${total - summary.ok} of ${total} component(s) out of parity.`,
    { color }
  );
  return [...lines, "", "Summary:", bars, "", verdict].join("\n");
}
function mdCell(value) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
function renderMarkdown(report) {
  const header = "| Component | Status | Detail |";
  const separator = "| --- | --- | --- |";
  const rows = report.rows.map(
    (row) => `| ${mdCell(row.component)} | ${mdCell(row.status)} | ${mdCell(row.detail)} |`
  );
  const { summary } = report;
  const summaryLine = `_ok: ${summary.ok} \xB7 prop-mismatch: ${summary.propMismatch} \xB7 missing-in-code: ${summary.missingInCode} \xB7 missing-in-figma: ${summary.missingInFigma}_`;
  return [header, separator, ...rows, "", summaryLine].join("\n");
}
function hasRegistry2(candidate) {
  return existsSync8(
    join10(resolvePath3(candidate), ".ds-bridge", "registry.json")
  );
}
function disambiguate2(component, path) {
  if (component !== void 0 && component !== "" && path === "." && !hasRegistry2(".") && hasRegistry2(component)) {
    return { component: void 0, path: component };
  }
  return { component, path };
}
function runParity(rawComponent, rawPath, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail8(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const { component, path } = disambiguate2(rawComponent, rawPath);
  const targetDir = resolvePath3(path);
  if (!existsSync8(targetDir) || !statSync5(targetDir).isDirectory()) {
    fail8(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const registry = loadRegistry3(targetDir);
  if (registry === void 0) return;
  const full = buildParity(registry);
  const rows = filterRows(full.rows, component);
  const report = { rows, summary: summarize(rows) };
  if (options.markdown) {
    process.stdout.write(`${renderMarkdown(report)}
`);
  } else if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
  } else {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(`${renderTerm8(report, color)}
`);
  }
  const allOk = report.rows.every((row) => row.status === "ok");
  process.exitCode = allOk ? 0 : 1;
}
function registerParityCommand(program2) {
  program2.command("parity").description(
    "Compare code components against the Figma library via the saved registry"
  ).argument("[component]", "filter rows by normalized name substring").argument(
    "[path]",
    "project directory holding .ds-bridge/registry.json",
    "."
  ).option("--format <format>", "output format: term | json", "term").option(
    "--markdown",
    "emit a GitHub-flavored markdown table to stdout",
    false
  ).action(
    (component, path, options) => {
      runParity(component, path, options);
    }
  );
}

// src/cli-commands/registry.ts
import {
  existsSync as existsSync9,
  mkdirSync as mkdirSync7,
  readFileSync as readFileSync9,
  statSync as statSync6,
  writeFileSync as writeFileSync6
} from "fs";
import { dirname as dirname4, join as join11, resolve as resolvePath4 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// src/engines/registry/match.ts
var MATCH_THRESHOLD = 0.6;
var AMBIGUITY_GAP = 0.1;
var TOKEN_SCORE_FLOOR = 0.3;
var NAME_WEIGHT = 0.7;
var SHAPE_WEIGHT = 0.3;
var MAX_CANDIDATES = 3;
function normalizeName3(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function tokenize3(name) {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Za-z])([0-9])/g, "$1 $2").replace(/([0-9])([A-Za-z])/g, "$1 $2");
  const tokens = [];
  for (const part of spaced.split(/[^a-zA-Z0-9]+/)) {
    const token = part.toLowerCase();
    if (token.length > 0) tokens.push(token);
  }
  return tokens;
}
function tokenSetScore(a, b) {
  const setA = new Set(tokenize3(a));
  const setB = new Set(tokenize3(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return 2 * intersection / (setA.size + setB.size);
}
function nameScore(codeName, figmaName) {
  if (normalizeName3(codeName) === normalizeName3(figmaName)) return 1;
  const score = tokenSetScore(codeName, figmaName);
  return score < TOKEN_SCORE_FLOOR ? 0 : score;
}
function valueJaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const value of setA) {
    if (setB.has(value)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
function normalizedKeyIndex(variants) {
  const index = /* @__PURE__ */ new Map();
  for (const key of Object.keys(variants)) {
    const values = variants[key] ?? [];
    const norm = normalizeName3(key);
    const existing = index.get(norm);
    if (existing === void 0) {
      index.set(norm, [...values]);
    } else {
      existing.push(...values);
    }
  }
  return index;
}
function shapeScore(codeVariants, figmaVariants) {
  const codeIndex = normalizedKeyIndex(codeVariants);
  const figmaIndex = normalizedKeyIndex(figmaVariants);
  const codeEmpty = codeIndex.size === 0;
  const figmaEmpty = figmaIndex.size === 0;
  if (codeEmpty && figmaEmpty) return 0.5;
  if (codeEmpty || figmaEmpty) return 0.25;
  const keys = /* @__PURE__ */ new Set([...codeIndex.keys(), ...figmaIndex.keys()]);
  let total = 0;
  for (const key of keys) {
    total += valueJaccard(codeIndex.get(key) ?? [], figmaIndex.get(key) ?? []);
  }
  return total / keys.size;
}
function scorePair(codeComponent, figmaModel) {
  const name = nameScore(codeComponent.name, figmaModel.name);
  const shape = shapeScore(codeComponent.variants, figmaModel.variantProps);
  return {
    nameScore: name,
    shapeScore: shape,
    score: NAME_WEIGHT * name + SHAPE_WEIGHT * shape
  };
}
function byNameAsc4(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function rankFigmaCandidates(codeComponent, figma) {
  return figma.map((figmaModel) => ({
    figma: figmaModel,
    score: scorePair(codeComponent, figmaModel).score
  })).sort(
    (a, b) => a.score !== b.score ? b.score - a.score : byNameAsc4(a.figma.name, b.figma.name)
  ).slice(0, MAX_CANDIDATES);
}
function rankCodeCandidates(figmaModel, code) {
  return code.map((codeComponent) => ({
    code: codeComponent,
    score: scorePair(codeComponent, figmaModel).score
  })).sort(
    (a, b) => a.score !== b.score ? b.score - a.score : byNameAsc4(a.code.name, b.code.name)
  ).slice(0, MAX_CANDIDATES);
}
function matchComponents(code, figma) {
  const edges = [];
  for (let c2 = 0; c2 < code.length; c2 += 1) {
    const codeComponent = code[c2];
    if (codeComponent === void 0) continue;
    for (let f3 = 0; f3 < figma.length; f3 += 1) {
      const figmaModel = figma[f3];
      if (figmaModel === void 0) continue;
      const parts = scorePair(codeComponent, figmaModel);
      if (parts.score >= MATCH_THRESHOLD) {
        edges.push({ codeIndex: c2, figmaIndex: f3, parts });
      }
    }
  }
  edges.sort((a, b) => {
    if (a.parts.score !== b.parts.score) return b.parts.score - a.parts.score;
    const codeA = code[a.codeIndex]?.name ?? "";
    const codeB = code[b.codeIndex]?.name ?? "";
    const byCode = byNameAsc4(codeA, codeB);
    if (byCode !== 0) return byCode;
    const figmaA = figma[a.figmaIndex]?.name ?? "";
    const figmaB = figma[b.figmaIndex]?.name ?? "";
    return byNameAsc4(figmaA, figmaB);
  });
  const matchedCode = /* @__PURE__ */ new Set();
  const matchedFigma = /* @__PURE__ */ new Set();
  const matches = [];
  for (const edge of edges) {
    if (matchedCode.has(edge.codeIndex)) continue;
    if (matchedFigma.has(edge.figmaIndex)) continue;
    const codeComponent = code[edge.codeIndex];
    if (codeComponent === void 0) continue;
    let best = -1;
    let second = -1;
    for (let f3 = 0; f3 < figma.length; f3 += 1) {
      if (matchedFigma.has(f3)) continue;
      const figmaModel2 = figma[f3];
      if (figmaModel2 === void 0) continue;
      const s = scorePair(codeComponent, figmaModel2).score;
      if (s > best) {
        second = best;
        best = s;
      } else if (s > second) {
        second = s;
      }
    }
    const ambiguous = second >= MATCH_THRESHOLD && best >= MATCH_THRESHOLD && best - second < AMBIGUITY_GAP;
    if (ambiguous) {
      continue;
    }
    matchedCode.add(edge.codeIndex);
    matchedFigma.add(edge.figmaIndex);
    const figmaModel = figma[edge.figmaIndex];
    if (figmaModel === void 0) continue;
    matches.push({
      code: codeComponent,
      figma: figmaModel,
      score: edge.parts.score,
      nameScore: edge.parts.nameScore,
      shapeScore: edge.parts.shapeScore
    });
  }
  matches.sort((a, b) => byNameAsc4(a.code.name, b.code.name));
  const unmatchedCode = [];
  for (let c2 = 0; c2 < code.length; c2 += 1) {
    if (matchedCode.has(c2)) continue;
    const codeComponent = code[c2];
    if (codeComponent === void 0) continue;
    unmatchedCode.push({
      code: codeComponent,
      candidates: rankFigmaCandidates(codeComponent, figma)
    });
  }
  unmatchedCode.sort((a, b) => byNameAsc4(a.code.name, b.code.name));
  const unmatchedFigma = [];
  for (let f3 = 0; f3 < figma.length; f3 += 1) {
    if (matchedFigma.has(f3)) continue;
    const figmaModel = figma[f3];
    if (figmaModel === void 0) continue;
    unmatchedFigma.push({
      figma: figmaModel,
      candidates: rankCodeCandidates(figmaModel, code)
    });
  }
  unmatchedFigma.sort((a, b) => byNameAsc4(a.figma.name, b.figma.name));
  return { matches, unmatchedCode, unmatchedFigma };
}

// src/engines/registry/persist.ts
function round3(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1e3) / 1e3;
}
function normalizeName4(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function byNameAsc5(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function toRegistryFile(result, generatedAt) {
  const matches = result.matches.map((m) => ({
    codeName: m.code.name,
    importPath: m.code.importPath,
    figmaName: m.figma.name,
    nodeId: m.figma.nodeId,
    score: round3(m.score)
  })).sort((a, b) => byNameAsc5(a.codeName, b.codeName));
  const unmatchedCode = result.unmatchedCode.map((u) => ({
    name: u.code.name,
    importPath: u.code.importPath,
    candidates: u.candidates.map((c2) => ({
      figmaName: c2.figma.name,
      nodeId: c2.figma.nodeId,
      score: round3(c2.score)
    }))
  })).sort((a, b) => byNameAsc5(a.name, b.name));
  const unmatchedFigma = result.unmatchedFigma.map((u) => ({
    name: u.figma.name,
    nodeId: u.figma.nodeId,
    candidates: u.candidates.map((c2) => ({
      codeName: c2.code.name,
      score: round3(c2.score)
    }))
  })).sort((a, b) => byNameAsc5(a.name, b.name));
  return {
    schemaVersion: 1,
    generatedAt,
    matches,
    unmatchedCode,
    unmatchedFigma
  };
}
function resolveEntry(registry, nodeNameOrId) {
  const query = nodeNameOrId;
  const normalizedQuery = normalizeName4(query);
  for (const entry of registry.matches) {
    if (entry.nodeId === query) return { kind: "match", entry };
  }
  for (const entry of registry.matches) {
    if (entry.figmaName === query) return { kind: "match", entry };
  }
  if (normalizedQuery.length > 0) {
    for (const entry of registry.matches) {
      if (normalizeName4(entry.figmaName) === normalizedQuery) {
        return { kind: "match", entry };
      }
    }
  }
  for (const entry of registry.unmatchedFigma) {
    if (entry.nodeId === query) {
      return { kind: "candidates", entries: entry.candidates };
    }
  }
  for (const entry of registry.unmatchedFigma) {
    if (entry.name === query) {
      return { kind: "candidates", entries: entry.candidates };
    }
  }
  if (normalizedQuery.length > 0) {
    for (const entry of registry.unmatchedFigma) {
      if (normalizeName4(entry.name) === normalizedQuery) {
        return { kind: "candidates", entries: entry.candidates };
      }
    }
  }
  return { kind: "not-found" };
}

// src/cli-commands/registry.ts
async function scanCode2(targetDir) {
  const globals = globalThis;
  if (typeof globals.__filename !== "string") {
    const filename = fileURLToPath3(import.meta.url);
    globals.__filename = filename;
    globals.__dirname = dirname4(filename);
  }
  const { scanCodeComponents } = await import("./scan-code-XUHRU37J.mjs");
  return scanCodeComponents(targetDir);
}
var DEFAULT_FIGMA_API_BASE4 = "https://api.figma.com";
function fail9(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function missingTokenMessage3() {
  return [
    "No Figma personal access token configured.",
    "",
    "Set one via the plugin config dialog (stored in the system keychain) or,",
    "for standalone CLI use, export FIGMA_TOKEN with a Dev/Full-seat PAT:",
    "",
    "  export FIGMA_TOKEN=figd_your_token_here",
    "",
    "The token needs the file_content:read and library_content:read scopes, and",
    "must come from a Dev or Full seat \u2014 a View seat is rate-limited and cannot",
    "be used here."
  ].join("\n");
}
function missingFileKeyMessage2() {
  return [
    "No Figma library file key configured.",
    "",
    "Set the figma_file_key plugin option, or for standalone CLI use export it:",
    "",
    "  export CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY=<key>",
    "",
    "The key is the segment after /file/ or /design/ in the library file URL."
  ].join("\n");
}
function clientErrorMessage3(result) {
  switch (result.kind) {
    case "auth-error":
      return "Figma rejected the token (auth error). Check that FIGMA_TOKEN is a valid Dev/Full-seat personal access token.";
    case "scope-error":
      return `Figma token is missing a required scope: ${result.message}. The token needs file_content:read and library_content:read.`;
    case "not-found":
      return "Figma could not find that file. Check figma_file_key is correct and the token's account can access the library.";
    case "rate-limited":
      return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited \u2014 use a Dev/Full-seat PAT.`;
    case "network-error":
      return `Could not reach the Figma API: ${result.message}.`;
  }
}
async function runBuild(path, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail9(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const targetDir = resolvePath4(path);
  if (!existsSync9(targetDir) || !statSync6(targetDir).isDirectory()) {
    fail9(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const resolved = resolveConfig({ env: process.env });
  if (resolved.kind !== "ok") {
    fail9(resolved.message);
    return;
  }
  for (const warning of resolved.warnings) {
    process.stderr.write(`warning: ${warning}
`);
  }
  const { config } = resolved;
  if (config.figmaToken.kind === "missing") {
    fail9(missingTokenMessage3());
    return;
  }
  if (config.figmaFileKey === void 0 || config.figmaFileKey === "") {
    fail9(missingFileKeyMessage2());
    return;
  }
  const code = await scanCode2(targetDir);
  const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE4;
  const client = createFigmaClient({
    token: config.figmaToken.value,
    baseUrl
  });
  const componentsResult = await client.getComponents(config.figmaFileKey);
  if (componentsResult.kind !== "ok") {
    fail9(clientErrorMessage3(componentsResult));
    return;
  }
  const fileResult = await client.getFile(config.figmaFileKey);
  if (fileResult.kind !== "ok") {
    fail9(clientErrorMessage3(fileResult));
    return;
  }
  const figma = buildFigmaComponentModel({
    published: componentsResult.data,
    fileDocument: fileResult.data.document
  });
  const matchResult = matchComponents(code, figma);
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const registry = toRegistryFile(matchResult, generatedAt);
  const stateDir = join11(targetDir, ".ds-bridge");
  const registryPath = join11(stateDir, "registry.json");
  try {
    mkdirSync7(stateDir, { recursive: true });
    writeFileSync6(
      registryPath,
      `${JSON.stringify(registry, null, 2)}
`,
      "utf8"
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail9(`Could not write registry to "${registryPath}": ${detail}`);
    return;
  }
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(registry, null, 2)}
`);
  } else {
    process.stdout.write(`${renderBuildSummary(registry, registryPath)}
`);
  }
  process.exitCode = 0;
}
function worstAmbiguities(registry) {
  const lines = [];
  const ranked = [...registry.unmatchedCode].map((u) => ({
    name: u.name,
    top: u.candidates[0]
  })).filter((u) => u.top !== void 0).sort((a, b) => (b.top?.score ?? 0) - (a.top?.score ?? 0)).slice(0, 3);
  for (const entry of ranked) {
    const top = entry.top;
    if (top === void 0) continue;
    lines.push(
      `  ${entry.name} \u2014 closest: ${top.figmaName} (${top.nodeId}) @ ${top.score}`
    );
  }
  return lines;
}
function renderBuildSummary(registry, registryPath) {
  const lines = [
    `Registry written to ${registryPath}`,
    `  matched:        ${registry.matches.length}`,
    `  unmatched code: ${registry.unmatchedCode.length}`,
    `  unmatched figma:${registry.unmatchedFigma.length}`
  ];
  const ambiguities = worstAmbiguities(registry);
  if (ambiguities.length > 0) {
    lines.push("", "Closest near-misses:", ...ambiguities);
  }
  return lines.join("\n");
}
function loadRegistry4(targetDir) {
  const registryPath = join11(targetDir, ".ds-bridge", "registry.json");
  if (!existsSync9(registryPath)) {
    fail9(
      `No registry found at "${registryPath}". Run "ds-bridge registry build" first.`
    );
    return void 0;
  }
  let raw;
  try {
    raw = readFileSync9(registryPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail9(`Could not read registry "${registryPath}": ${detail}`);
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail9(`Registry "${registryPath}" is not valid JSON: ${detail}`);
    return void 0;
  }
}
function runResolve(nodeNameOrId, path) {
  const targetDir = resolvePath4(path);
  if (!existsSync9(targetDir) || !statSync6(targetDir).isDirectory()) {
    fail9(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const registry = loadRegistry4(targetDir);
  if (registry === void 0) return;
  const outcome = resolveEntry(registry, nodeNameOrId);
  switch (outcome.kind) {
    case "match":
      process.stdout.write(`${JSON.stringify(outcome.entry, null, 2)}
`);
      process.exitCode = 0;
      return;
    case "candidates":
      process.stdout.write(
        `${JSON.stringify(
          {
            kind: "candidates",
            node: nodeNameOrId,
            candidates: outcome.entries
          },
          null,
          2
        )}
`
      );
      process.exitCode = 1;
      return;
    case "not-found":
      process.stderr.write(
        `No registry entry found for "${nodeNameOrId}". It is neither a matched node nor an unmatched Figma component in the registry.
`
      );
      process.exitCode = 1;
      return;
  }
}
function registerRegistryCommand(program2) {
  const registry = program2.command("registry").description("Build and query the Figma\u2194code component registry");
  registry.command("build").description(
    "Scan code components, fetch the Figma library, and write .ds-bridge/registry.json"
  ).argument("[path]", "project directory to scan", ".").option("--format <format>", "output format: term | json", "term").action((path, options) => {
    void runBuild(path, options);
  });
  registry.command("resolve").description("Resolve a Figma node id or name against the saved registry").argument("<nodeNameOrId>", "Figma node id (e.g. 10:42) or component name").argument(
    "[path]",
    "project directory holding .ds-bridge/registry.json",
    "."
  ).action((nodeNameOrId, path) => {
    runResolve(nodeNameOrId, path);
  });
}

// src/cli-commands/report.ts
import { spawn } from "child_process";
import {
  existsSync as existsSync10,
  mkdirSync as mkdirSync8,
  readFileSync as readFileSync10,
  statSync as statSync7,
  writeFileSync as writeFileSync7
} from "fs";
import { basename, dirname as dirname5, join as join12, resolve as resolve7 } from "path";
import { platform } from "process";

// src/render/html/charts.ts
var DEFAULT_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0891b2"
];
var TRACK_COLOR = "#e5e7eb";
var TEXT_COLOR2 = "#374151";
var GAUGE_COLOR = "#2563eb";
var HEAT_COLOR = "#2563eb";
var AXIS_COLOR = "#9ca3af";
function escapeXml2(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function round2(n) {
  return Number(n.toFixed(3));
}
function clamp3(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
function niceNum(x, snap) {
  const exp = Math.floor(Math.log10(x));
  const fraction = x / 10 ** exp;
  let nice;
  if (snap) {
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
  } else {
    if (fraction <= 1) nice = 1;
    else if (fraction <= 2) nice = 2;
    else if (fraction <= 5) nice = 5;
    else nice = 10;
  }
  return nice * 10 ** exp;
}
function niceTicks(min, max, maxTicks) {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  const intervals = Math.max(1, maxTicks - 1);
  let span = hi - lo;
  if (span === 0) {
    span = Math.abs(hi) || 1;
    lo = hi - span / 2;
    hi = lo + span;
  }
  const niceSpan = niceNum(span, false);
  const step = niceSpan / intervals;
  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let i = 0; i <= intervals; i++) {
    ticks.push(Number((start + i * step).toFixed(10)));
  }
  return ticks;
}
function svgOpen(width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`;
}
function emptyState(width, height, title) {
  const safe = escapeXml2(title);
  return [
    svgOpen(width, height),
    `<title>${safe}</title>`,
    `<text x="${round2(width / 2)}" y="${round2(height / 2)}" text-anchor="middle" dominant-baseline="middle" fill="${TEXT_COLOR2}" font-family="sans-serif" font-size="12">No data</text>`,
    "</svg>"
  ].join("");
}
function lineChart(series, opts = {}) {
  const width = opts.width ?? 480;
  const height = opts.height ?? 240;
  const palette = opts.colors ?? [...DEFAULT_PALETTE];
  const plottable = series.filter((s) => s.points.length > 0);
  const allPoints = plottable.flatMap((s) => s.points);
  if (plottable.length === 0 || allPoints.length === 0) {
    return emptyState(width, height, "Line chart (no data)");
  }
  const pad2 = { top: 16, right: 16, bottom: 28, left: 40 };
  const plotW = Math.max(0, width - pad2.left - pad2.right);
  const plotH = Math.max(0, height - pad2.top - pad2.bottom);
  const xs = allPoints.map((p4) => p4.x);
  const ys = allPoints.map((p4) => p4.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys);
  const yTicks = niceTicks(minY, maxY, 5);
  const yLo = yTicks[0] ?? minY;
  const yHi = yTicks[yTicks.length - 1] ?? maxY;
  const xSpan = maxX - minX || 1;
  const ySpan = yHi - yLo || 1;
  const sx = (x) => pad2.left + (x - minX) / xSpan * plotW;
  const sy = (y) => pad2.top + (1 - (y - yLo) / ySpan) * plotH;
  const parts = [];
  parts.push(svgOpen(width, height));
  parts.push(
    `<title>Line chart: ${escapeXml2(series.map((s) => s.label).join(", "))}</title>`
  );
  for (const tick of yTicks) {
    const y = round2(sy(tick));
    parts.push(
      `<line x1="${pad2.left}" y1="${y}" x2="${round2(width - pad2.right)}" y2="${y}" stroke="${AXIS_COLOR}" stroke-width="0.5" />`
    );
    parts.push(
      `<text x="${round2(pad2.left - 6)}" y="${round2(y + 3)}" text-anchor="end" fill="${TEXT_COLOR2}" font-family="sans-serif" font-size="10">${tick}</text>`
    );
  }
  plottable.forEach((s, index) => {
    const stroke = palette[index % palette.length] ?? GAUGE_COLOR;
    const pointsAttr = s.points.map((p4) => `${round2(sx(p4.x))},${round2(sy(p4.y))}`).join(" ");
    parts.push(
      `<polyline fill="none" stroke="${stroke}" stroke-width="2" points="${pointsAttr}" />`
    );
  });
  parts.push("</svg>");
  return parts.join("");
}
function barChart(items, opts = {}) {
  const width = opts.width ?? 480;
  const rowH = 24;
  const height = opts.height ?? Math.max(rowH, items.length * rowH + 16);
  const fill = opts.color ?? DEFAULT_PALETTE[0];
  if (items.length === 0) {
    return emptyState(width, height, "Bar chart (no data)");
  }
  const pad2 = { top: 8, right: 40, bottom: 8, left: 80 };
  const trackW = Math.max(0, width - pad2.left - pad2.right);
  const max = Math.max(0, ...items.map((i) => i.value));
  const parts = [];
  parts.push(svgOpen(width, height));
  parts.push(
    `<title>Bar chart: ${escapeXml2(items.map((i) => i.label).join(", "))}</title>`
  );
  items.forEach((item, index) => {
    const clamped = Math.max(0, item.value);
    const barW = max > 0 ? round2(clamped / max * trackW) : 0;
    const y = pad2.top + index * rowH;
    const barY = y + 4;
    const barH = rowH - 8;
    const midY = round2(y + rowH / 2 + 3);
    parts.push(
      `<text x="${round2(pad2.left - 6)}" y="${midY}" text-anchor="end" fill="${TEXT_COLOR2}" font-family="sans-serif" font-size="11">${escapeXml2(item.label)}</text>`
    );
    parts.push(
      `<rect class="bar" x="${pad2.left}" y="${barY}" width="${barW}" height="${barH}" fill="${fill}" rx="2" />`
    );
    parts.push(
      `<text x="${round2(pad2.left + barW + 4)}" y="${midY}" text-anchor="start" fill="${TEXT_COLOR2}" font-family="sans-serif" font-size="11">${escapeXml2(String(item.value))}</text>`
    );
  });
  parts.push("</svg>");
  return parts.join("");
}
function donutGauge(value, opts = {}) {
  const size = 120;
  const clamped = clamp3(value, 0, 100);
  const display = Math.round(clamped);
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const drawn = round2(clamped / 100 * circumference);
  const gap = round2(circumference - drawn);
  const labelText = opts.label !== void 0 ? `${opts.label}: ` : "";
  const title = `${labelText}${display}%`;
  return [
    svgOpen(size, size),
    `<title>${escapeXml2(title)}</title>`,
    `<circle cx="${cx}" cy="${cy}" r="${round2(radius)}" fill="none" stroke="${TRACK_COLOR}" stroke-width="${strokeWidth}" />`,
    `<circle cx="${cx}" cy="${cy}" r="${round2(radius)}" fill="none" stroke="${GAUGE_COLOR}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${drawn} ${gap}" transform="rotate(-90 ${cx} ${cy})" />`,
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${TEXT_COLOR2}" font-family="sans-serif" font-size="24" font-weight="600">${display}</text>`,
    "</svg>"
  ].join("");
}
function heatGrid(rows, opts = {}) {
  const cellSize = 28;
  const labelW = 72;
  const maxCells = Math.max(0, ...rows.map((r2) => r2.cells.length));
  const width = opts.width ?? labelW + Math.max(1, maxCells) * cellSize + 8;
  const height = opts.height ?? Math.max(cellSize, rows.length * cellSize + 8);
  const fill = opts.color ?? HEAT_COLOR;
  if (rows.length === 0) {
    return emptyState(width, height, "Heat grid (no data)");
  }
  const pad2 = { top: 4, left: labelW };
  const parts = [];
  parts.push(svgOpen(width, height));
  parts.push(
    `<title>Heat grid: ${escapeXml2(rows.map((r2) => r2.label).join(", "))}</title>`
  );
  rows.forEach((row, rowIndex) => {
    const y = pad2.top + rowIndex * cellSize;
    parts.push(
      `<text x="${labelW - 6}" y="${round2(y + cellSize / 2 + 3)}" text-anchor="end" fill="${TEXT_COLOR2}" font-family="sans-serif" font-size="11">${escapeXml2(row.label)}</text>`
    );
    row.cells.forEach((cell, cellIndex) => {
      const x = pad2.left + cellIndex * cellSize;
      const opacity = round2(clamp3(cell.intensity, 0, 1));
      parts.push(
        `<rect class="cell" x="${x}" y="${y}" width="${cellSize - 2}" height="${cellSize - 2}" fill="${fill}" fill-opacity="${opacity}" rx="2" />`
      );
    });
  });
  parts.push("</svg>");
  return parts.join("");
}

// src/render/html/dashboard.ts
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var STYLE = `
:root {
	--bg: #f7f8fa;
	--surface: #ffffff;
	--text: #1c2128;
	--text-subtle: #57606a;
	--border: #d8dee4;
	--accent: #0d7d62;
	--accent-soft: #e6f7f1;
	--radius: 12px;
	--shadow: 0 1px 2px rgba(28, 33, 40, 0.06), 0 4px 12px rgba(28, 33, 40, 0.04);
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	line-height: 1.5;
	-webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px; }
header.dash {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px 24px;
	padding-bottom: 20px;
	border-bottom: 1px solid var(--border);
	margin-bottom: 28px;
}
header.dash h1 { font-size: 22px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
header.dash .project { color: var(--accent); }
header.dash .generated { color: var(--text-subtle); font-size: 13px; font-variant-numeric: tabular-nums; }
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
	gap: 20px;
}
section.panel {
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: var(--radius);
	box-shadow: var(--shadow);
	padding: 18px 20px 20px;
	min-width: 0;
}
section.panel h2 {
	font-size: 14px;
	font-weight: 600;
	margin: 0 0 14px;
	color: var(--text);
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.chart { overflow-x: auto; }
.chart svg { max-width: 100%; height: auto; display: block; }
.empty {
	display: flex;
	flex-direction: column;
	gap: 6px;
	align-items: flex-start;
	justify-content: center;
	min-height: 120px;
	padding: 16px;
	border: 1px dashed var(--border);
	border-radius: 8px;
	background: var(--bg);
	color: var(--text-subtle);
}
.empty .empty-title { font-weight: 600; color: var(--text); }
.empty code {
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
	font-size: 12px;
	background: var(--accent-soft);
	color: var(--accent);
	padding: 2px 6px;
	border-radius: 6px;
}
table.parity-key, .meta {
	width: 100%;
	margin-top: 12px;
	font-size: 12px;
	color: var(--text-subtle);
	border-collapse: collapse;
}
.cols { margin-top: 10px; font-size: 12px; color: var(--text-subtle); }
.cols b { color: var(--text); font-weight: 600; }
table.weights { width: 100%; margin-top: 12px; font-size: 12px; border-collapse: collapse; }
table.weights th, table.weights td { padding: 4px 8px; border-top: 1px solid var(--border); text-align: left; }
table.weights th { color: var(--text-subtle); font-weight: 600; }
table.weights td.num, table.weights th + th { text-align: right; font-variant-numeric: tabular-nums; }
ul.offenders { margin: 12px 0 0; padding: 0; list-style: none; font-size: 12px; }
ul.offenders li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-top: 1px solid var(--border); }
ul.offenders code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--text); }
ul.offenders .count { color: var(--accent); font-variant-numeric: tabular-nums; font-weight: 600; }
ul.deductions { margin: 12px 0 0; padding: 0; list-style: none; font-size: 12px; }
ul.deductions li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
ul.deductions .pts { color: var(--text-subtle); font-variant-numeric: tabular-nums; }
.frame-name { font-size: 13px; color: var(--text-subtle); margin-top: 10px; text-align: center; }
`.trim();
function emptyState2(command) {
  return [
    '<div class="empty">',
    '<span class="empty-title">No data yet</span>',
    `<span>Run <code>ds-bridge ${escapeHtml(command)}</code> to populate this section.</span>`,
    "</div>"
  ].join("");
}
function panel(title, body) {
  return [
    '<section class="panel">',
    `<h2>${escapeHtml(title)}</h2>`,
    body,
    "</section>"
  ].join("");
}
var COMPONENT_LABEL = {
  drift: "drift",
  lint: "lint",
  readiness: "readiness",
  a11y: "a11y"
};
function systemScoreSection(data) {
  const score = data.systemScore;
  if (score === void 0) {
    return panel("System score", emptyState2("report"));
  }
  const trendSeries = [
    {
      label: "score",
      points: score.trend.map((point, index) => ({
        x: index,
        y: point.score
      }))
    }
  ];
  const legendRows = score.components.map(
    (c2) => `<tr><td>${escapeHtml(COMPONENT_LABEL[c2.kind] ?? c2.kind)}</td><td class="num">${escapeHtml(String(c2.score))}</td><td class="num">${escapeHtml(String(c2.weight))}</td></tr>`
  ).join("");
  const legend = [
    '<table class="weights">',
    "<thead><tr><th>Component</th><th>Sub-score</th><th>Weight</th></tr></thead>",
    `<tbody>${legendRows}</tbody>`,
    "</table>"
  ].join("");
  return panel(
    "System score",
    [
      `<div class="chart" style="text-align:center">${donutGauge(score.current, { label: "System score" })}</div>`,
      `<div class="chart">${lineChart(trendSeries)}</div>`,
      legend
    ].join("")
  );
}
function driftSection(data) {
  const trend = data.driftTrend;
  if (trend === void 0 || trend.length === 0) {
    return panel("Drift trend", emptyState2("diff --since <ref>"));
  }
  const toSeries = (label, pick) => ({
    label,
    points: trend.map((point, index) => ({ x: index, y: pick(point) }))
  });
  const series = [
    toSeries("breaking", (p4) => p4.breaking),
    toSeries("additive", (p4) => p4.additive),
    toSeries("cosmetic", (p4) => p4.cosmetic)
  ];
  const dateRange = trend.length > 0 ? `${escapeHtml(trend[0]?.date ?? "")} \u2192 ${escapeHtml(trend[trend.length - 1]?.date ?? "")}` : "";
  return panel(
    "Drift trend",
    [
      `<div class="chart">${lineChart(series)}</div>`,
      `<div class="cols"><b>Breaking</b> \xB7 <b>Additive</b> \xB7 <b>Cosmetic</b> over ${dateRange}</div>`
    ].join("")
  );
}
function lintSection(data) {
  const lint = data.lintSummary;
  if (lint === void 0) {
    return panel("Lint violations", emptyState2("ds-lint"));
  }
  const bars = [
    { label: "Exact", value: lint.byKind.exact },
    { label: "Near", value: lint.byKind.near },
    { label: "Off-system", value: lint.byKind.offSystem }
  ];
  const offenders = lint.topOffenders.length > 0 ? [
    '<ul class="offenders">',
    ...lint.topOffenders.map(
      (o) => `<li><code>${escapeHtml(o.file)}</code><span class="count">${escapeHtml(String(o.count))}</span></li>`
    ),
    "</ul>"
  ].join("") : "";
  return panel(
    "Lint violations",
    `<div class="chart">${barChart(bars)}</div>${offenders}`
  );
}
function readinessSection(data) {
  const readiness = data.readiness;
  if (readiness === void 0) {
    return panel("Readiness", emptyState2("qa <frame>"));
  }
  const deductions = readiness.deductions.length > 0 ? [
    '<ul class="deductions">',
    ...readiness.deductions.map(
      (d) => `<li><span>${escapeHtml(d.reason)}</span><span class="pts">-${escapeHtml(String(d.points))}</span></li>`
    ),
    "</ul>"
  ].join("") : "";
  return panel(
    "Readiness",
    [
      `<div class="chart" style="text-align:center">${donutGauge(readiness.score, { label: "Readiness" })}</div>`,
      `<div class="frame-name">${escapeHtml(readiness.frameName)}</div>`,
      deductions
    ].join("")
  );
}
var PARITY_INTENSITY = {
  ok: 0.12,
  "prop-mismatch": 0.55,
  "missing-in-code": 0.8,
  "missing-in-figma": 1
};
function paritySection(data) {
  const parity = data.parity;
  if (parity === void 0 || parity.rows.length === 0) {
    return panel("Parity matrix", emptyState2("parity"));
  }
  const rows = parity.rows.map((row) => ({
    label: row.component,
    cells: row.cells.map((cell) => ({
      label: cell.status,
      intensity: PARITY_INTENSITY[cell.status]
    }))
  }));
  const columns = parity.columns.length > 0 ? `<div class="cols">Columns: ${parity.columns.map((c2) => `<b>${escapeHtml(c2)}</b>`).join(" \xB7 ")}</div>` : "";
  return panel(
    "Parity matrix",
    `<div class="chart">${heatGrid(rows)}</div>${columns}`
  );
}
function a11ySection(data) {
  const a11y = data.a11y;
  if (a11y === void 0 || a11y.modes.length === 0) {
    return panel("Contrast (a11y)", emptyState2("a11y"));
  }
  const bars = a11y.modes.map((m) => ({
    label: m.mode,
    value: m.failed
  }));
  const tallies = [
    '<ul class="modes">',
    ...a11y.modes.map(
      (m) => `<li><code>${escapeHtml(m.mode)}</code><span class="count">${escapeHtml(String(m.passed))} passed \xB7 ${escapeHtml(String(m.failed))} failed</span></li>`
    ),
    "</ul>"
  ].join("");
  return panel(
    "Contrast (a11y)",
    [
      `<div class="meta">Failures by mode \xB7 level ${escapeHtml(a11y.level)}</div>`,
      `<div class="chart">${barChart(bars)}</div>`,
      tallies
    ].join("")
  );
}
function impactSection(data) {
  const impact = data.impact;
  if (impact === void 0) {
    return panel("Change impact", emptyState2("impact"));
  }
  const bars = [
    { label: "Breaking", value: impact.breaking },
    { label: "Additive", value: impact.additive },
    { label: "Cosmetic", value: impact.cosmetic }
  ];
  const sites = impact.touchedCallSites;
  const radius = `<div class="meta">Touches ${escapeHtml(String(sites))} call site${sites === 1 ? "" : "s"}</div>`;
  return panel(
    "Change impact",
    `<div class="chart">${barChart(bars)}</div>${radius}`
  );
}
var SECTION_RENDERERS = {
  "system-score": systemScoreSection,
  "drift-trend": driftSection,
  "lint-summary": lintSection,
  readiness: readinessSection,
  parity: paritySection,
  a11y: a11ySection,
  impact: impactSection
};
function renderDashboard(data, selection = ALL_ARTIFACT_IDS, options = {}) {
  const project = escapeHtml(data.project);
  const generatedAt = escapeHtml(data.generatedAt);
  const viewLabel = options.viewLabel === void 0 ? "" : `<span class="view">${escapeHtml(options.viewLabel)}</span>`;
  const sections = selection.map((id) => SECTION_RENDERERS[id](data));
  const body = [
    '<div class="wrap">',
    '<header class="dash">',
    `<h1>ds-bridge report \xB7 <span class="project">${project}</span></h1>`,
    viewLabel,
    `<span class="generated">Generated ${generatedAt}</span>`,
    "</header>",
    '<div class="grid">',
    ...sections,
    "</div>",
    "</div>"
  ].join("");
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>ds-bridge report \xB7 ${project}</title>`,
    `<style>${STYLE}</style>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

// src/cli-commands/report.ts
var RULE_REASON = {
  "var-binding": "Variable binding",
  "auto-layout": "Auto layout",
  component: "Component usage",
  naming: "Naming"
};
function asNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function aggregateHistory(stateDir, onWarning) {
  const historyPath = join12(stateDir, "history.jsonl");
  let text;
  try {
    text = readFileSync10(historyPath, "utf8");
  } catch {
    return {
      driftTrend: [],
      lintSummary: void 0,
      readiness: void 0,
      a11y: void 0,
      impact: void 0
    };
  }
  const driftTrend = [];
  let lint;
  let readiness;
  let a11y;
  let impact;
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    if (trimmed === "") continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      onWarning(
        `warning: skipping corrupted history line ${index + 1} in ${historyPath}`
      );
      continue;
    }
    if (record.kind === "tokens-check") {
      const r2 = record;
      const date = typeof r2.at === "string" ? r2.at.slice(0, 10) : "";
      driftTrend.push({
        date,
        breaking: asNumber2(r2.stale),
        additive: asNumber2(r2.missing),
        cosmetic: asNumber2(r2.orphan)
      });
      continue;
    }
    if (record.kind === "lint") {
      const r2 = record;
      const byKind = r2.byKind ?? { exact: 0, near: 0, offSystem: 0 };
      lint = {
        byKind: {
          exact: asNumber2(byKind.exact),
          near: asNumber2(byKind.near),
          offSystem: asNumber2(byKind.offSystem)
        },
        topOffenders: []
      };
      continue;
    }
    if (record.kind === "handoff") {
      const r2 = record;
      const deductions = Array.isArray(r2.deductions) ? r2.deductions : [];
      readiness = {
        score: asNumber2(r2.score),
        frameName: typeof r2.frameName === "string" ? r2.frameName : "",
        deductions: deductions.map((d) => ({
          reason: RULE_REASON[d.rule] ?? d.rule,
          points: asNumber2(d.points)
        }))
      };
      continue;
    }
    if (record.kind === "a11y") {
      const r2 = record;
      const modes2 = Array.isArray(r2.modes) ? r2.modes : [];
      a11y = {
        level: r2.level === "AAA" ? "AAA" : "AA",
        modes: modes2.map((m) => ({
          mode: typeof m.mode === "string" ? m.mode : "",
          passed: asNumber2(m.passed),
          failed: asNumber2(m.failed)
        }))
      };
      continue;
    }
    if (record.kind === "impact") {
      const r2 = record;
      impact = {
        breaking: asNumber2(r2.breaking),
        additive: asNumber2(r2.additive),
        cosmetic: asNumber2(r2.cosmetic),
        touchedCallSites: asNumber2(r2.touchedCallSites)
      };
    }
  }
  return { driftTrend, lintSummary: lint, readiness, a11y, impact };
}
function computeSystemScore(stateDir, weights) {
  const historyPath = join12(stateDir, "history.jsonl");
  let text;
  try {
    text = readFileSync10(historyPath, "utf8");
  } catch {
    return void 0;
  }
  const outcome = scoreFromHistory(text, weights);
  if (outcome.kind === "no-data") return void 0;
  return {
    current: outcome.current,
    components: outcome.components,
    trend: outcome.trend
  };
}
function readParity(stateDir, onWarning) {
  const registryPath = join12(stateDir, "registry.json");
  let text;
  try {
    text = readFileSync10(registryPath, "utf8");
  } catch {
    return void 0;
  }
  let registry;
  try {
    registry = JSON.parse(text);
  } catch {
    onWarning(`warning: skipping unreadable registry ${registryPath}`);
    return void 0;
  }
  const section = toParitySection(buildParity(registry));
  if (section.rows.length === 0) return void 0;
  return section;
}
function writeDashboard(outPath, html) {
  try {
    mkdirSync8(dirname5(outPath), { recursive: true });
    writeFileSync7(outPath, html, "utf8");
    return { kind: "ok" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      message: `Could not write report to "${outPath}": ${detail}`
    };
  }
}
function openerCommand(env) {
  const override = env.DS_BRIDGE_OPEN_CMD;
  if (override !== void 0 && override.trim() !== "") return override;
  return platform === "darwin" ? "open" : "xdg-open";
}
function openReport(filePath, env) {
  const command = openerCommand(env);
  try {
    const child = spawn(command, [filePath], {
      stdio: "ignore",
      detached: false
    });
    child.on("error", (error) => {
      process.stderr.write(
        `warning: could not open report with "${command}": ${error.message}
`
      );
    });
    child.unref();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `warning: could not open report with "${command}": ${detail}
`
    );
  }
}
function failReport(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function parseArtifactsFlag(raw) {
  if (raw === void 0) return void 0;
  return raw.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
}
function resolveSelection(targetDir, options) {
  let dashboardView;
  let dashboardArtifacts;
  let scoreWeights;
  const configPath = join12(targetDir, ".ds-bridge.json");
  if (existsSync10(configPath)) {
    let projectFileText;
    try {
      projectFileText = readFileSync10(configPath, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        kind: "error",
        message: `Could not read ${configPath}: ${detail}`
      };
    }
    const resolved = resolveConfig({ projectFileText });
    if (resolved.kind === "invalid-project-file") {
      return { kind: "error", message: resolved.message };
    }
    dashboardView = resolved.config.dashboardView;
    dashboardArtifacts = resolved.config.dashboardArtifacts;
    scoreWeights = resolved.config.scoreWeights;
  }
  const flagArtifacts = parseArtifactsFlag(options.artifacts);
  const outcome = resolveView(
    {
      ...options.view !== void 0 ? { view: options.view } : {},
      ...flagArtifacts !== void 0 ? { artifacts: flagArtifacts } : {}
    },
    {
      ...dashboardView !== void 0 ? { view: dashboardView } : {},
      ...dashboardArtifacts !== void 0 ? { artifacts: dashboardArtifacts } : {}
    }
  );
  switch (outcome.kind) {
    case "conflicting-selection":
      return {
        kind: "error",
        message: outcome.source === "flags" ? "--view and --artifacts are mutually exclusive \u2014 pass one, not both." : "dashboard_view and dashboard_artifacts in .ds-bridge.json are mutually exclusive \u2014 set one, not both."
      };
    case "unknown-view": {
      const hint = outcome.suggestions.length > 0 ? ` \u2014 did you mean ${outcome.suggestions.join(", ")}?` : "";
      return {
        kind: "error",
        message: `Unknown view "${outcome.view}"${hint}`
      };
    }
    case "unknown-artifact": {
      const hint = outcome.suggestions.length > 0 ? ` \u2014 did you mean ${outcome.suggestions.join(", ")}?` : "";
      return {
        kind: "error",
        message: `Unknown artifact id "${outcome.id}"${hint}`
      };
    }
    case "ok": {
      for (const notice of outcome.notices) {
        process.stderr.write(`${notice}
`);
      }
      const viewLabel = outcome.source === "default" ? void 0 : outcome.viewName ?? "custom";
      return {
        artifacts: outcome.artifacts,
        ...viewLabel !== void 0 ? { viewLabel } : {},
        ...scoreWeights !== void 0 ? { scoreWeights } : {}
      };
    }
  }
}
function runReport(path, options) {
  const targetDir = resolve7(path);
  if (!existsSync10(targetDir) || !statSync7(targetDir).isDirectory()) {
    failReport(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const selection = resolveSelection(targetDir, options);
  if ("kind" in selection) {
    failReport(selection.message);
    return;
  }
  const stateDir = join12(targetDir, ".ds-bridge");
  const warn = (message) => {
    process.stderr.write(`${message}
`);
  };
  const aggregation = aggregateHistory(stateDir, warn);
  const parity = readParity(stateDir, warn);
  const systemScore = computeSystemScore(stateDir, selection.scoreWeights);
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const html = renderDashboard(
    {
      generatedAt,
      project: basename(targetDir),
      ...systemScore !== void 0 ? { systemScore } : {},
      driftTrend: aggregation.driftTrend,
      ...aggregation.lintSummary !== void 0 ? { lintSummary: aggregation.lintSummary } : {},
      ...aggregation.readiness !== void 0 ? { readiness: aggregation.readiness } : {},
      ...parity !== void 0 ? { parity } : {},
      ...aggregation.a11y !== void 0 ? { a11y: aggregation.a11y } : {},
      ...aggregation.impact !== void 0 ? { impact: aggregation.impact } : {}
    },
    selection.artifacts,
    selection.viewLabel !== void 0 ? { viewLabel: selection.viewLabel } : {}
  );
  const outPath = options.out !== void 0 ? resolve7(options.out) : join12(stateDir, "reports", "dashboard.html");
  const written = writeDashboard(outPath, html);
  if (written.kind === "error") {
    failReport(written.message);
    return;
  }
  process.stdout.write(`${outPath}
`);
  if (options.open) {
    openReport(outPath, process.env);
  }
  process.exitCode = 0;
}
function registerReportCommand(program2) {
  program2.command("report").description("Render an offline HTML dashboard from the project history").argument("[path]", "project directory to report on", ".").option(
    "--view <preset>",
    "render a persona preset: owner | engineering | design | consumer | everything"
  ).option(
    "--artifacts <ids>",
    "render a custom comma-separated artifact list (mutually exclusive with --view)"
  ).option(
    "--out <file>",
    "output file (default <path>/.ds-bridge/reports/dashboard.html)"
  ).option(
    "--open",
    'open the report after writing (override the opener with the DS_BRIDGE_OPEN_CMD env var; defaults to "open" on macOS, "xdg-open" elsewhere)',
    false
  ).action((path, options) => {
    runReport(path, options);
  });
}

// src/cli-commands/tokens.ts
import {
  appendFileSync as appendFileSync5,
  existsSync as existsSync11,
  mkdirSync as mkdirSync9,
  readdirSync as readdirSync2,
  readFileSync as readFileSync11,
  statSync as statSync8,
  writeFileSync as writeFileSync8
} from "fs";
import { isAbsolute as isAbsolute3, join as join13, relative as relative2, resolve as resolve8, sep as sep3 } from "path";

// src/engines/tokens/drift.ts
function nameKey(name) {
  return name.toLowerCase().replace(/\./g, "-");
}
function canonical(type, raw) {
  if (type === "color" && typeof raw === "string") {
    return normalizeColor(raw) ?? raw.trim();
  }
  if (type === "dimension") {
    const dim = normalizeDimension(raw);
    if (dim !== void 0) return `${dim.px}px`;
  }
  return String(raw).trim();
}
function entryName(entry) {
  return entry.kind === "orphan-output" ? entry.output.name : entry.token.name;
}
function classifyDrift(source, outputs) {
  const outputsByKey = /* @__PURE__ */ new Map();
  for (const output of outputs) {
    outputsByKey.set(nameKey(output.name), output);
  }
  const entries = [];
  const matchedOutputKeys = /* @__PURE__ */ new Set();
  let inSync = 0;
  for (const token of source.tokens) {
    if (typeof token.value === "object") continue;
    const key = nameKey(token.name);
    const output = outputsByKey.get(key);
    if (output === void 0) {
      entries.push({ kind: "missing-output", token });
      continue;
    }
    matchedOutputKeys.add(key);
    if (canonical(token.type, token.value) === canonical(token.type, output.raw)) {
      inSync += 1;
    } else {
      entries.push({ kind: "stale-output", token, output });
    }
  }
  for (const output of outputs) {
    if (!matchedOutputKeys.has(nameKey(output.name))) {
      entries.push({ kind: "orphan-output", output });
    }
  }
  entries.sort(
    (a, b) => nameKey(entryName(a)) < nameKey(entryName(b)) ? -1 : 1
  );
  return { entries, inSync };
}

// src/engines/tokens/scan-outputs.ts
var CSS_EXTENSIONS = [".css", ".scss"];
var TS_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];
function scanOutputs(file) {
  const lower = file.path.toLowerCase();
  if (CSS_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return finish(scanCss(file.content), []);
  }
  if (TS_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    const { values, warnings } = scanTsTheme(file.content);
    return finish(values, warnings);
  }
  return { kind: "unsupported-file", path: file.path };
}
function finish(values, warnings) {
  values.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return { kind: "ok", values, warnings };
}
var CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
var CUSTOM_PROP_RE = /--([A-Za-z0-9_-]+)\s*:\s*([^;}]+)/g;
function scanCss(content) {
  const stripped = content.replace(CSS_COMMENT_RE, "");
  const values = [];
  for (const match of stripped.matchAll(CUSTOM_PROP_RE)) {
    const name = match[1];
    const rawValue = match[2];
    if (name === void 0 || rawValue === void 0) continue;
    const raw = rawValue.replace(/!important/g, "").trim();
    if (raw !== "") values.push({ name, raw });
  }
  return values;
}
var THEME_EXPORT_RE = /export\s+const\s+[\w$]+(?:\s*:\s*[^={]+?)?\s*=\s*\{/;
function scanTsTheme(content) {
  const start = THEME_EXPORT_RE.exec(content);
  if (start === null) return { values: [], warnings: [] };
  const values = [];
  const warnings = [];
  let i = start.index + start[0].length;
  function skipTrivia() {
    for (; ; ) {
      while (i < content.length && /\s/.test(content[i])) i += 1;
      if (content.startsWith("//", i)) {
        const nl = content.indexOf("\n", i);
        i = nl === -1 ? content.length : nl + 1;
        continue;
      }
      if (content.startsWith("/*", i)) {
        const end = content.indexOf("*/", i + 2);
        i = end === -1 ? content.length : end + 2;
        continue;
      }
      return;
    }
  }
  function parseString() {
    const quote = content[i];
    if (quote !== '"' && quote !== "'" && quote !== "`") return void 0;
    let out = "";
    i += 1;
    while (i < content.length) {
      const ch = content[i];
      if (ch === "\\") {
        out += content[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) {
        i += 1;
        return out;
      }
      out += ch;
      i += 1;
    }
    return void 0;
  }
  function skipExpression() {
    let depth = 0;
    while (i < content.length) {
      const ch = content[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        parseString();
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      if (ch === ")" || ch === "]") depth -= 1;
      if (ch === "}") {
        if (depth === 0) return;
        depth -= 1;
      }
      if (ch === "," && depth === 0) return;
      i += 1;
    }
  }
  function parseObjectBody(prefix) {
    for (; ; ) {
      skipTrivia();
      if (i >= content.length) return;
      if (content[i] === "}") {
        i += 1;
        return;
      }
      if (content[i] === ",") {
        i += 1;
        continue;
      }
      let key;
      if (content[i] === '"' || content[i] === "'") {
        key = parseString();
      } else {
        const m = /^[\w$-]+/.exec(content.slice(i));
        if (m !== null) {
          key = m[0];
          i += m[0].length;
        }
      }
      if (key === void 0) {
        warnings.push(`unparseable key near offset ${i} \u2014 stopping theme scan`);
        return;
      }
      skipTrivia();
      if (content[i] !== ":") {
        warnings.push(`expected ":" after key "${key}" \u2014 skipping`);
        skipExpression();
        continue;
      }
      i += 1;
      skipTrivia();
      const name = prefix === "" ? key : `${prefix}.${key}`;
      const ch = content[i];
      if (ch === "{") {
        i += 1;
        parseObjectBody(name);
      } else if (ch === '"' || ch === "'" || ch === "`") {
        const value = parseString();
        if (value !== void 0) values.push({ name, raw: value });
      } else {
        const num3 = /^-?\d+(?:\.\d+)?/.exec(content.slice(i));
        if (num3 !== null) {
          values.push({ name, raw: num3[0] });
          i += num3[0].length;
        } else {
          warnings.push(`non-literal value for "${name}" \u2014 skipped`);
          skipExpression();
        }
      }
    }
  }
  parseObjectBody("");
  return { values, warnings };
}

// src/cli-commands/tokens.ts
var TABLE_LIMIT = 20;
var PARSERS4 = {
  w3c: parseW3c,
  "tokens-studio": parseTokensStudio,
  "style-dictionary": parseStyleDictionary
};
function previewValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}
function countsByType(map) {
  const counts = /* @__PURE__ */ new Map();
  for (const token of map.tokens) {
    counts.set(token.type, (counts.get(token.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : 1));
}
function renderTerm9(filePath, map, color) {
  const heading = `${filePath} \u2014 format: ${map.format} \u2014 ${map.tokens.length} tokens`;
  const chart = renderBarChart(countsByType(map), { width: 24, color });
  const rows = map.tokens.slice(0, TABLE_LIMIT).map((token) => [token.name, token.type, previewValue(token.value)]);
  const table = renderTable(["name", "type", "value"], rows, { color });
  const lines = [heading, "", chart, "", table];
  if (map.tokens.length > TABLE_LIMIT) {
    lines.push("", `\u2026 ${map.tokens.length - TABLE_LIMIT} more`);
  }
  return lines.join("\n");
}
function loadTokenMap2(filePath) {
  let raw;
  try {
    raw = readFileSync11(filePath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not read file "${filePath}": ${detail}
`);
    process.exitCode = 1;
    return void 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`"${filePath}" is not valid JSON: ${detail}
`);
    process.exitCode = 1;
    return void 0;
  }
  const format = detectFormat(parsed);
  if (format === "unknown") {
    process.stderr.write(
      `Could not detect a supported token format for "${filePath}". Expected W3C, Tokens Studio, or Style Dictionary.
`
    );
    process.exitCode = 1;
    return void 0;
  }
  const outcome = PARSERS4[format](parsed);
  if (outcome.kind === "error") {
    process.stderr.write(`Failed to parse "${filePath}" as ${format}:
`);
    for (const err of outcome.errors) {
      const where = err.path !== void 0 ? ` (${err.path})` : "";
      process.stderr.write(`  ${err.code}${where}: ${err.message}
`);
    }
    process.exitCode = 1;
    return void 0;
  }
  for (const warning of outcome.warnings) {
    process.stderr.write(`warning: ${warning}
`);
  }
  return outcome.map;
}
var EXCLUDED_DIRS3 = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".ds-bridge",
  "dist",
  "out",
  ".next",
  "coverage"
]);
var OUTPUT_EXTENSIONS = [".css", ".scss", ".ts"];
var DRIFT_SEVERITY = {
  "stale-output": "error",
  "missing-output": "warn",
  "orphan-output": "info"
};
var PARSERS_CHECK = {
  w3c: parseW3c,
  "tokens-studio": parseTokensStudio,
  "style-dictionary": parseStyleDictionary
};
function hasOutputExtension(name) {
  const lower = name.toLowerCase();
  return OUTPUT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
function walkOutputFiles(dir, acc) {
  let entries;
  try {
    entries = readdirSync2(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join13(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS3.has(entry.name)) continue;
      walkOutputFiles(full, acc);
      continue;
    }
    if (entry.isFile() && hasOutputExtension(entry.name)) acc.push(full);
  }
}
function depthOf3(path) {
  return path.split(sep3).filter((s) => s.length > 0).length;
}
function isConventionalTokenFile3(name) {
  if (!name.endsWith(".json")) return false;
  return name === "tokens.json" || name === "design-tokens.json" || name.endsWith(".tokens.json");
}
function isTokenDir3(name) {
  return name === "tokens" || name === "design-tokens";
}
function collectTokenCandidates2(dir, insideTokenDir, acc) {
  let entries;
  try {
    entries = readdirSync2(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join13(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS3.has(entry.name)) continue;
      collectTokenCandidates2(
        full,
        insideTokenDir || isTokenDir3(entry.name),
        acc
      );
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    if (insideTokenDir || isConventionalTokenFile3(entry.name)) acc.push(full);
  }
}
function detectFileFormat3(absPath) {
  let raw;
  try {
    raw = readFileSync11(absPath, "utf8");
  } catch {
    return void 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  const format = detectFormat(parsed);
  return format === "unknown" ? void 0 : format;
}
function discoverFirstTokenSource2(root) {
  const candidates = [];
  collectTokenCandidates2(root, false, candidates);
  const verified = candidates.filter((path) => detectFileFormat3(path) !== void 0).sort((a, b) => {
    const depth = depthOf3(a) - depthOf3(b);
    return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
  });
  return verified[0];
}
function resolveTokenSource2(targetDir, flagTokens) {
  if (flagTokens !== void 0) {
    const abs2 = isAbsolute3(flagTokens) ? flagTokens : resolve8(process.cwd(), flagTokens);
    if (!existsSync11(abs2)) {
      return {
        kind: "error",
        message: `Token source "${abs2}" (from --tokens) does not exist.`
      };
    }
    return { kind: "ok", path: abs2 };
  }
  const configPath = join13(targetDir, ".ds-bridge.json");
  if (existsSync11(configPath)) {
    let projectFileText;
    try {
      projectFileText = readFileSync11(configPath, "utf8");
    } catch {
      projectFileText = void 0;
    }
    if (projectFileText !== void 0) {
      const resolved = resolveConfig({ projectFileText });
      if (resolved.kind === "ok" && resolved.config.tokenSource !== void 0) {
        const src = resolved.config.tokenSource;
        const abs2 = isAbsolute3(src) ? src : resolve8(targetDir, src);
        if (existsSync11(abs2)) return { kind: "ok", path: abs2 };
        return {
          kind: "error",
          message: `token_source "${abs2}" from .ds-bridge.json does not exist.`
        };
      }
    }
  }
  const discovered = discoverFirstTokenSource2(targetDir);
  if (discovered !== void 0) return { kind: "ok", path: discovered };
  return {
    kind: "error",
    message: `No design-token source found for "${targetDir}".
Pass one with --tokens <file>, set token_source in .ds-bridge.json, or add a conventional token file (tokens.json, design-tokens.json, *.tokens.json).`
  };
}
function loadTokenMapForCheck(tokenPath) {
  let raw;
  try {
    raw = readFileSync11(tokenPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      message: `Could not read token source "${tokenPath}": ${detail}`
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      message: `Token source "${tokenPath}" is not valid JSON: ${detail}`
    };
  }
  const format = detectFormat(parsed);
  if (format === "unknown") {
    return {
      kind: "error",
      message: `Could not detect a supported token format for "${tokenPath}". Expected W3C, Tokens Studio, or Style Dictionary.`
    };
  }
  const outcome = PARSERS_CHECK[format](parsed);
  if (outcome.kind === "error") {
    const lines = outcome.errors.map((e4) => {
      const where = e4.path !== void 0 ? ` (${e4.path})` : "";
      return `  ${e4.code}${where}: ${e4.message}`;
    });
    return {
      kind: "error",
      message: `Failed to parse token source "${tokenPath}" as ${format}:
${lines.join("\n")}`
    };
  }
  return { kind: "ok", map: outcome.map };
}
function scanMergedOutputs(outputsDir, tokenSourcePath) {
  const files = [];
  walkOutputFiles(outputsDir, files);
  files.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const merged = /* @__PURE__ */ new Map();
  const ownerByName = /* @__PURE__ */ new Map();
  const warnings = [];
  for (const file of files) {
    if (resolve8(file) === resolve8(tokenSourcePath)) continue;
    let content;
    try {
      content = readFileSync11(file, "utf8");
    } catch {
      continue;
    }
    const outcome = scanOutputs({ path: file, content });
    if (outcome.kind !== "ok") continue;
    for (const warning of outcome.warnings) {
      warnings.push(`${relative2(outputsDir, file)}: ${warning}`);
    }
    for (const value of outcome.values) {
      const prior = ownerByName.get(value.name);
      if (prior !== void 0 && prior !== file) {
        warnings.push(
          `output "${value.name}" defined in both ${relative2(outputsDir, prior)} and ${relative2(outputsDir, file)} \u2014 later wins`
        );
      }
      merged.set(value.name, value);
      ownerByName.set(value.name, file);
    }
  }
  const values = [...merged.values()].sort(
    (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  return { values, warnings };
}
function countByKind2(result) {
  let stale = 0;
  let missing = 0;
  let orphan = 0;
  for (const entry of result.entries) {
    if (entry.kind === "stale-output") stale += 1;
    else if (entry.kind === "missing-output") missing += 1;
    else orphan += 1;
  }
  return { stale, missing, orphan };
}
function driftDetail(entry) {
  switch (entry.kind) {
    case "stale-output":
      return [
        entry.token.name,
        severityColorless(entry.kind),
        `source ${String(entry.token.value)} \u2260 output ${entry.output.raw}`
      ];
    case "missing-output":
      return [
        entry.token.name,
        severityColorless(entry.kind),
        `no output for source ${String(entry.token.value)}`
      ];
    case "orphan-output":
      return [
        entry.output.name,
        severityColorless(entry.kind),
        `output ${entry.output.raw} has no source token`
      ];
  }
}
function severityColorless(kind) {
  return kind;
}
function renderCheckTerm(result, color) {
  const { stale, missing, orphan } = countByKind2(result);
  const countRows = [
    [severityColor("error", "stale-output", { color }), String(stale)],
    [severityColor("warn", "missing-output", { color }), String(missing)],
    [severityColor("info", "orphan-output", { color }), String(orphan)]
  ];
  const countsTable = renderTable(["drift", "count"], countRows, { color });
  const total = result.entries.length;
  const heading = total === 0 ? `In sync \u2014 ${result.inSync} token${result.inSync === 1 ? "" : "s"} match output` : `${total} drift entr${total === 1 ? "y" : "ies"} (${result.inSync} in sync)`;
  const lines = [heading, "", countsTable];
  if (total > 0) {
    const rows = result.entries.map((entry) => {
      const [name, kind, detail] = driftDetail(entry);
      const label = severityColor(DRIFT_SEVERITY[entry.kind], kind, { color });
      return [name, label, detail];
    });
    lines.push("", renderTable(["name", "kind", "detail"], rows, { color }));
  }
  return lines.join("\n");
}
function checkJson(result) {
  return JSON.stringify(
    { entries: result.entries, inSync: result.entries.length === 0 },
    null,
    2
  );
}
function appendHistory(stateDir, record) {
  mkdirSync9(stateDir, { recursive: true });
  appendFileSync5(
    join13(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
function readDriftTrend(stateDir) {
  const historyPath = join13(stateDir, "history.jsonl");
  let text;
  try {
    text = readFileSync11(historyPath, "utf8");
  } catch {
    return [];
  }
  const points = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (record.kind !== "tokens-check") continue;
    const date = typeof record.at === "string" ? record.at.slice(0, 10) : "";
    points.push({
      date,
      breaking: record.stale ?? 0,
      additive: record.missing ?? 0,
      cosmetic: record.orphan ?? 0
    });
  }
  return points;
}
function writeReport(stateDir, project, generatedAt) {
  const trend = readDriftTrend(stateDir);
  const html = renderDashboard({
    generatedAt,
    project,
    driftTrend: trend
  });
  const reportsDir = join13(stateDir, "reports");
  mkdirSync9(reportsDir, { recursive: true });
  const date = generatedAt.slice(0, 10);
  const reportPath = join13(reportsDir, `tokens-${date}.html`);
  writeFileSync8(reportPath, html, "utf8");
  return reportPath;
}
function failCheck(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function runCheck(path, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    failCheck(
      `Unknown --format "${options.format}". Expected "json" or "term".`
    );
    return;
  }
  const targetDir = resolve8(path);
  if (!existsSync11(targetDir) || !statSync8(targetDir).isDirectory()) {
    failCheck(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const tokenSource = resolveTokenSource2(targetDir, options.tokens);
  if (tokenSource.kind === "error") {
    failCheck(tokenSource.message);
    return;
  }
  const loaded = loadTokenMapForCheck(tokenSource.path);
  if (loaded.kind === "error") {
    failCheck(loaded.message);
    return;
  }
  const outputsDir = options.outputs !== void 0 ? resolve8(options.outputs) : targetDir;
  if (!existsSync11(outputsDir) || !statSync8(outputsDir).isDirectory()) {
    failCheck(`Outputs path "${outputsDir}" is not a directory.`);
    return;
  }
  const { values, warnings } = scanMergedOutputs(outputsDir, tokenSource.path);
  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}
`);
  }
  const result = classifyDrift(loaded.map, values);
  const { stale, missing, orphan } = countByKind2(result);
  const inSync = result.entries.length === 0;
  const stateDir = join13(targetDir, ".ds-bridge");
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  appendHistory(stateDir, {
    at: generatedAt,
    kind: "tokens-check",
    stale,
    missing,
    orphan,
    inSync
  });
  if (format === "json") {
    process.stdout.write(`${checkJson(result)}
`);
  } else {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(`${renderCheckTerm(result, color)}
`);
  }
  if (options.report) {
    const reportPath = writeReport(stateDir, targetDir, generatedAt);
    process.stdout.write(`Report: ${reportPath}
`);
  }
  process.exitCode = inSync ? 0 : 1;
}
function registerTokensCommand(program2) {
  const tokens = program2.command("tokens").description("Inspect and analyze design tokens");
  tokens.command("check").description("Detect drift between the token source and built outputs").argument("[path]", "project directory to check", ".").option("--tokens <file>", "explicit token source file").option("--outputs <dir>", "directory of built CSS/SCSS/TS outputs to scan").option(
    "--report",
    "also write an HTML dashboard with the drift trend",
    false
  ).option("--format <format>", "output format: term | json", "term").action((path, options) => {
    runCheck(path, options);
  });
  tokens.command("parse").description("Parse a design-token file and print its normalized model").argument("<path>", "path to a W3C / Tokens Studio / Style Dictionary file").option("--format <format>", "output format: json | term", "term").action((path, options) => {
    const format = options.format;
    if (format !== "json" && format !== "term") {
      process.stderr.write(
        `Unknown --format "${options.format}". Expected "json" or "term".
`
      );
      process.exitCode = 1;
      return;
    }
    const map = loadTokenMap2(path);
    if (map === void 0) return;
    if (format === "json") {
      process.stdout.write(`${JSON.stringify(map, null, 2)}
`);
      return;
    }
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(`${renderTerm9(path, map, color)}
`);
  });
}

// src/cli.ts
var require2 = createRequire(import.meta.url);
var pkg = require2("../package.json");
function buildProgram() {
  const program2 = new Command().name("ds-bridge").description(
    "Design-system bridge: token drift, DS-aware linting, handoff QA, design-to-code"
  ).version(pkg.version);
  registerTokensCommand(program2);
  registerLintCommand(program2);
  registerReportCommand(program2);
  registerBadgeCommand(program2);
  registerHandoffCommand(program2);
  registerRegistryCommand(program2);
  registerParityCommand(program2);
  registerA11yCommand(program2);
  registerImpactCommand(program2);
  registerChangelogCommand(program2);
  registerDocsCommand(program2);
  registerDashboardCommand(program2);
  return program2;
}
buildProgram().parse();
export {
  buildProgram
};
