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
      _collectValue(value2, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value2];
        }
        previous.push(value2);
        return previous;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value2, description) {
        this.defaultValue = value2;
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
      default(value2, description) {
        this.defaultValue = value2;
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
      _collectValue(value2, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value2];
        }
        previous.push(value2);
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
        this.negativeOptions.forEach((value2, key) => {
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
      valueFromOption(value2, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value2);
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
    function editDistance5(a, b) {
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
        const distance = editDistance5(word, candidate);
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
      _callParseArg(target, value2, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value2, previous);
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
      setOptionValue(key, value2) {
        return this.setOptionValueWithSource(key, value2, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value2, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value2;
        } else {
          this._optionValues[key] = value2;
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
        const myParseArg = (argument, value2, previous) => {
          let parsedValue = value2;
          if (value2 !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value2}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value2,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value2 = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value2 = this.args.slice(index);
              if (declaredArg.parseArg) {
                value2 = value2.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value2 === void 0) {
              value2 = [];
            }
          } else if (index < this.args.length) {
            value2 = this.args[index];
            if (declaredArg.parseArg) {
              value2 = myParseArg(declaredArg, value2, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value2;
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
                const value2 = args[i++];
                if (value2 === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value2);
              } else if (option.optional) {
                let value2 = null;
                if (i < args.length && (!maybeOption(args[i]) || negativeNumberArg(args[i]))) {
                  value2 = args[i++];
                }
                this.emit(`option:${option.name()}`, value2);
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
import { join as join24 } from "path";

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
  let value2 = "";
  if (chars[_i] === "-" || chars[_i] === "+") {
    value2 += chars[_i++];
  }
  value2 += digits(chars);
  if (chars[_i] === "." && /\d/.test(chars[_i + 1])) {
    value2 += chars[_i++] + digits(chars);
  }
  if (chars[_i] === "e" || chars[_i] === "E") {
    if ((chars[_i + 1] === "-" || chars[_i + 1] === "+") && /\d/.test(chars[_i + 2])) {
      value2 += chars[_i++] + chars[_i++] + digits(chars);
    } else if (/\d/.test(chars[_i + 1])) {
      value2 += chars[_i++] + digits(chars);
    }
  }
  if (is_ident(chars)) {
    let id = ident(chars);
    if (id === "deg" || id === "rad" || id === "turn" || id === "grad") {
      return { type: Tok.Hue, value: value2 * huenits[id] };
    }
    return void 0;
  }
  if (chars[_i] === "%") {
    _i++;
    return { type: Tok.Percentage, value: +value2 };
  }
  return { type: Tok.Number, value: +value2 };
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
var f = (value2) => value2 > e ? Math.cbrt(value2) : (k * value2 + 16) / 116;
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
var f2 = (value2) => value2 > e3 ? Math.cbrt(value2) : (k3 * value2 + 16) / 116;
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
var l_fn = (value2) => value2 <= e3 ? k3 * value2 : 116 * Math.cbrt(value2) - 16;
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
var r = (value2, precision) => Math.round(value2 * (precision = Math.pow(10, precision))) / precision;
var round = (precision = 4) => (value2) => typeof value2 === "number" ? r(value2, precision) : value2;
var round_default = round;

// node_modules/culori/src/formatter.js
var twoDecimals = round_default(2);
var clamp = (value2) => Math.max(0, Math.min(1, value2 || 0));
var fixup = (value2) => Math.round(clamp(value2) * 255);
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
  const colors4 = map.tokens.filter(isColor);
  const foregrounds = colors4.filter((t) => isForegroundRole(t.name)).sort(byName);
  const backgrounds = colors4.filter((t) => isBackgroundRole(t.name)).sort(byName);
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
function isObject(value2) {
  return typeof value2 === "object" && value2 !== null && !Array.isArray(value2);
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
function isObject2(value2) {
  return typeof value2 === "object" && value2 !== null && !Array.isArray(value2);
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
function aliasTarget(value2) {
  if (typeof value2 !== "string") return void 0;
  const match = ALIAS_PATTERN.exec(value2);
  if (match === null) return void 0;
  const inner = match[1];
  if (inner === void 0) return void 0;
  return inner.endsWith(".value") ? inner.slice(0, -".value".length) : inner;
}
function collect(node, path, raws, errors) {
  if ("value" in node) {
    const name = path.join(".");
    const firstSegment = path[0] ?? "";
    const value2 = node.value;
    if (typeof value2 !== "string" && typeof value2 !== "number") {
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
      rawValue: value2,
      description,
      aliasOf: aliasTarget(value2)
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
function isPlainObject(value2) {
  return typeof value2 === "object" && value2 !== null && !Array.isArray(value2);
}
function readLeaf(node) {
  const hasClassic = "value" in node;
  const hasModern = "$value" in node;
  if (!hasClassic && !hasModern) return void 0;
  const value2 = hasModern ? node.$value : node.value;
  const type = hasModern ? node.$type : node.type;
  const description = node.$description ?? node.description;
  return { value: value2, type, description };
}
var ALIAS_RE = /^\{([^}]+)\}$/;
function aliasTarget2(value2) {
  if (typeof value2 !== "string") return void 0;
  const match = ALIAS_RE.exec(value2);
  return match ? match[1] : void 0;
}
function collectSet(setName, tree, out, errors) {
  const walk2 = (node, pathParts) => {
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
      walk2(child, [...pathParts, key]);
    }
  };
  walk2(tree, []);
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
  const resolve13 = (name, seen) => {
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
    const downstream = resolve13(target, new Set(seen).add(target));
    if (downstream === void 0) return void 0;
    const result = { value: downstream.value, aliasOf: target };
    resolved.set(name, result);
    return result;
  };
  const tokens = [];
  for (const [name, raw] of merged) {
    const res = resolve13(name, /* @__PURE__ */ new Set([name]));
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
function isPlainObject2(value2) {
  return typeof value2 === "object" && value2 !== null && !Array.isArray(value2);
}
function aliasTarget3(value2) {
  if (typeof value2 !== "string") return void 0;
  const match = /^\{([^}]+)\}$/.exec(value2.trim());
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
    const value2 = node.$value;
    if (typeof value2 !== "string" && typeof value2 !== "number" && !isPlainObject2(value2)) {
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
      rawValue: value2,
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

// src/render/terminal/blocks.ts
var FULL_BLOCK = "\u2588";
var PARTIAL_BLOCKS = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"];
function proportionalBar(fraction, width) {
  const eighths = Math.max(0, Math.round(fraction * width * 8));
  const fullCount = Math.min(Math.floor(eighths / 8), width);
  let bar = FULL_BLOCK.repeat(fullCount);
  const remainder = eighths % 8;
  if (fullCount < width && remainder > 0) {
    bar += PARTIAL_BLOCKS[remainder];
  }
  return bar;
}

// src/render/terminal/bar-chart.ts
var colors = import_picocolors.default.createColors(true);
function displayWidth(value2) {
  return [...value2].length;
}
function renderBarChart(items, opts) {
  const labelWidth = Math.max(0, ...items.map((i) => displayWidth(i.label)));
  const valueStrings = items.map((i) => String(i.value));
  const valueWidth = Math.max(0, ...valueStrings.map((v) => v.length));
  const max = Math.max(0, ...items.map((i) => i.value));
  return items.map((item, index) => {
    const clamped = Math.max(0, item.value);
    const fraction = max > 0 ? clamped / max : 0;
    const bar = proportionalBar(fraction, opts.width);
    const renderedBar = opts.color && bar.length > 0 ? colors.cyan(bar) : bar;
    const label = item.label + " ".repeat(labelWidth - displayWidth(item.label));
    const value2 = (valueStrings[index] ?? "").padStart(valueWidth);
    return `${label} \u2502${renderedBar} ${value2}`;
  }).join("\n");
}

// src/render/terminal/gauge.ts
var import_picocolors2 = __toESM(require_picocolors(), 1);
var colors2 = import_picocolors2.default.createColors(true);
var EMPTY_CELL = "\u2591";
function renderGauge(value2, opts) {
  const v = Math.max(0, Math.min(100, value2));
  const bar = proportionalBar(v / 100, opts.width);
  const filledCells = [...bar].length;
  const empty = EMPTY_CELL.repeat(Math.max(0, opts.width - filledCells));
  const filled = opts.color && bar.length > 0 ? colors2.cyan(bar) : bar;
  const meter = `[${filled}${empty}]`;
  const pct5 = `${Math.round(v)}%`;
  return opts.label !== void 0 && opts.label !== "" ? `${opts.label} ${meter} ${pct5}` : `${meter} ${pct5}`;
}

// src/render/terminal/severity.ts
var import_picocolors3 = __toESM(require_picocolors(), 1);
var colors3 = import_picocolors3.default.createColors(true);
var PALETTE = {
  error: (s) => colors3.red(s),
  warn: (s) => colors3.yellow(s),
  info: (s) => colors3.cyan(s),
  ok: (s) => colors3.green(s)
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
function isNumericCell(value2) {
  const trimmed = value2.trim();
  return trimmed !== "" && !Number.isNaN(Number(trimmed));
}
function displayWidth2(value2) {
  return [...value2].length;
}
function pad(value2, width, alignRight) {
  const gap = Math.max(0, width - displayWidth2(value2));
  const filler = " ".repeat(gap);
  return alignRight ? filler + value2 : value2 + filler;
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

// src/render/terminal/matrix.ts
var GLYPH = {
  ok: "\u2713",
  warn: "\u25B3",
  fail: "\u2717",
  none: "\xB7"
};
var SEVERITY = {
  ok: "ok",
  warn: "warn",
  fail: "error",
  none: "info"
};
function glyphFor(status, color) {
  return severityColor(SEVERITY[status], GLYPH[status], { color });
}
function renderMatrix(rows, columns, opts) {
  if (rows.length === 0) return "";
  const headers = ["", ...columns];
  const tableRows = rows.map((row) => [
    row.label,
    ...row.cells.map((cell) => glyphFor(cell, opts.color))
  ]);
  return renderTable(headers, tableRows, { color: opts.color });
}

// src/render/terminal/sparkline.ts
var TICKS = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];
function sparkline(values) {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const lastTick = TICKS.length - 1;
  return values.map((value2) => {
    if (range === 0) return TICKS[0];
    const index = Math.round((value2 - min) / range * lastTick);
    return TICKS[index];
  }).join("");
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
function isPlainObject3(value2) {
  return typeof value2 === "object" && value2 !== null && !Array.isArray(value2);
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
    let tally2 = byMode.get(finding.mode);
    if (tally2 === void 0) {
      tally2 = { mode: finding.mode, passed: 0, failed: 0 };
      byMode.set(finding.mode, tally2);
    }
    if (finding.status === "pass") tally2.passed += 1;
    else if (finding.status === "fail") tally2.failed += 1;
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

// src/cli-commands/adoption.ts
import {
  appendFileSync as appendFileSync2,
  existsSync as existsSync2,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync2,
  statSync as statSync2
} from "fs";
import { dirname, join as join3, resolve as resolve5 } from "path";
import { fileURLToPath } from "url";

// src/engines/registry/coverage.ts
var UNCOVERED_CAP = 20;
function byNameAsc(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function computeCoverage(registry, usage) {
  const importedNames = /* @__PURE__ */ new Set();
  for (const u of usage) {
    if (u.codeName !== void 0 && u.count >= 1) {
      importedNames.add(u.codeName);
    }
  }
  const codeNames = /* @__PURE__ */ new Set();
  for (const m of registry.matches) codeNames.add(m.codeName);
  for (const u of registry.unmatchedCode) codeNames.add(u.name);
  let imported = 0;
  const uncovered = [];
  for (const name of codeNames) {
    if (importedNames.has(name)) imported += 1;
    else uncovered.push(name);
  }
  uncovered.sort(byNameAsc);
  return {
    imported,
    total: codeNames.size,
    uncovered: uncovered.slice(0, UNCOVERED_CAP),
    uncoveredTotal: uncovered.length
  };
}

// src/cli-commands/adoption.ts
function fail2(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function loadRegistry(targetDir) {
  const registryPath = join3(targetDir, ".ds-bridge", "registry.json");
  if (!existsSync2(registryPath)) {
    fail2(
      `No registry found at "${registryPath}". Run "ds-bridge registry build" first.`
    );
    return void 0;
  }
  let raw;
  try {
    raw = readFileSync2(registryPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail2(
      `Could not read registry "${registryPath}": ${detail}. Run "ds-bridge registry build" first.`
    );
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail2(
      `Registry "${registryPath}" is not valid JSON: ${detail}. Run "ds-bridge registry build" first.`
    );
    return void 0;
  }
}
async function scanUsage(registry, projectDir) {
  const globals = globalThis;
  if (typeof globals.__filename !== "string") {
    const filename = fileURLToPath(import.meta.url);
    globals.__filename = filename;
    globals.__dirname = dirname(filename);
  }
  const { mapUsage } = await import("./usage-OFLQCL5F.mjs");
  const changedFigmaNames = registry.matches.map((m) => m.figmaName);
  return mapUsage({ registry, changedFigmaNames, projectDir });
}
function appendAdoptionHistory(targetDir, coverage) {
  const stateDir = join3(targetDir, ".ds-bridge");
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "adoption",
    imported: coverage.imported,
    total: coverage.total,
    uncovered: coverage.uncovered
  };
  mkdirSync2(stateDir, { recursive: true });
  appendFileSync2(
    join3(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
function renderTerm2(coverage, color) {
  const { imported, total, uncovered, uncoveredTotal } = coverage;
  const pct5 = total > 0 ? Math.round(imported / total * 100) : 0;
  const clean = uncoveredTotal === 0;
  const summary = severityColor(
    clean ? "ok" : "warn",
    `Import coverage: ${imported}/${total} registry components imported (${pct5}%).`,
    { color }
  );
  const lines = [summary];
  if (total > 0) {
    lines.push(
      "",
      renderBarChart(
        [
          { label: "imported", value: imported },
          { label: "uncovered", value: uncoveredTotal }
        ],
        { width: 24, color }
      )
    );
  }
  if (uncovered.length > 0) {
    lines.push("", "Not yet imported:");
    for (const name of uncovered) lines.push(`  \xB7 ${name}`);
    if (uncoveredTotal > uncovered.length) {
      lines.push(`  \u2026 and ${uncoveredTotal - uncovered.length} more`);
    }
  }
  lines.push(
    "",
    "Note: coverage counts resolved .tsx imports only \u2014 .ts/.jsx/barrel",
    "re-exports may undercount, so this is a floor, not an exact census."
  );
  return lines.join("\n");
}
async function runAdoption(path, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail2(`Unknown --format "${options.format}". Expected "term" or "json".`);
    return;
  }
  const targetDir = resolve5(path);
  if (!existsSync2(targetDir) || !statSync2(targetDir).isDirectory()) {
    fail2(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const registry = loadRegistry(targetDir);
  if (registry === void 0) return;
  const usage = await scanUsage(registry, targetDir);
  const coverage = computeCoverage(registry, usage);
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(coverage, null, 2)}
`);
  } else {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(`${renderTerm2(coverage, color)}
`);
  }
  appendAdoptionHistory(targetDir, coverage);
  process.exitCode = 0;
}
function registerAdoptionCommand(program2) {
  program2.command("adoption").description(
    "Report which registry components the project's code actually imports"
  ).argument(
    "[path]",
    "project directory holding .ds-bridge/registry.json",
    "."
  ).option("--format <format>", "output format: term | json", "term").action((path, options) => {
    void runAdoption(path, options);
  });
}

// src/cli-commands/badge.ts
import {
  existsSync as existsSync4,
  mkdirSync as mkdirSync3,
  readFileSync as readFileSync4,
  statSync as statSync3,
  writeFileSync as writeFileSync2
} from "fs";
import { dirname as dirname2, join as join5, resolve as resolve6 } from "path";

// src/config.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, renameSync, writeFileSync } from "fs";
import { join as join4 } from "path";

// src/engines/report/catalog.ts
var ALL_PERSONAS = [
  "ds-designer",
  "ds-manager",
  "ds-engineer",
  "product-designer",
  "product-manager",
  "product-engineer"
];
var CATALOG = [
  {
    id: "system-score",
    title: "System score",
    personas: ALL_PERSONAS,
    reportDataKey: "systemScore"
  },
  {
    id: "drift-trend",
    title: "Token drift",
    personas: ["ds-manager", "ds-engineer"],
    reportDataKey: "driftTrend"
  },
  {
    id: "lint-summary",
    title: "Lint violations",
    personas: ["ds-engineer", "product-engineer"],
    reportDataKey: "lintSummary"
  },
  {
    id: "readiness",
    title: "Handoff readiness",
    personas: ["ds-designer", "product-designer", "product-manager"],
    reportDataKey: "readiness"
  },
  {
    id: "parity",
    title: "Component parity",
    personas: ALL_PERSONAS,
    reportDataKey: "parity"
  },
  {
    id: "a11y",
    title: "Contrast (a11y)",
    personas: ["ds-designer", "ds-manager", "ds-engineer", "product-designer"],
    reportDataKey: "a11y"
  },
  {
    id: "impact",
    title: "Change impact",
    personas: ["ds-engineer", "product-engineer"],
    reportDataKey: "impact"
  },
  {
    id: "adoption-trend",
    title: "Adoption trend",
    personas: ["ds-manager", "product-manager", "product-engineer"],
    reportDataKey: "adoptionTrend"
  },
  {
    id: "import-coverage",
    title: "Import coverage",
    personas: ["ds-manager", "product-manager", "product-engineer"],
    reportDataKey: "importCoverage"
  },
  {
    id: "leaderboard",
    title: "Adoption leaderboard",
    personas: ["ds-manager", "product-engineer"],
    reportDataKey: "leaderboard"
  },
  {
    id: "library-health",
    title: "Library health",
    personas: ["ds-designer", "ds-manager", "ds-engineer", "product-designer"],
    reportDataKey: "libraryHealth"
  },
  {
    id: "breaking-calendar",
    title: "Breaking calendar",
    personas: [
      "ds-manager",
      "product-designer",
      "product-manager",
      "product-engineer"
    ],
    reportDataKey: "breakingCalendar"
  },
  {
    id: "change-frequency",
    title: "Change frequency",
    personas: ["product-designer", "product-manager"],
    reportDataKey: "changeFrequency"
  },
  // ─── Persona-wave metric artifacts (C1–C13) ─────────────────────────────
  {
    id: "targets",
    title: "Targets / SLAs",
    personas: [
      "ds-manager",
      "ds-engineer",
      "product-manager",
      "product-engineer"
    ],
    reportDataKey: "targets"
  },
  {
    id: "parity-trend",
    title: "Parity trend",
    personas: ALL_PERSONAS,
    reportDataKey: "parityTrend"
  },
  {
    id: "component-health",
    title: "Component health",
    personas: ["ds-designer", "ds-engineer", "product-designer"],
    reportDataKey: "componentHealth"
  },
  {
    id: "library-health-trend",
    title: "Library health trend",
    personas: ["ds-designer", "ds-manager"],
    reportDataKey: "libraryHealthTrend"
  },
  {
    id: "migration-checklist",
    title: "Migration checklist",
    personas: ["ds-engineer", "product-engineer"],
    reportDataKey: "migrationChecklist"
  },
  {
    id: "score-velocity",
    title: "Score velocity",
    personas: ["ds-manager", "product-manager"],
    reportDataKey: "scoreVelocity"
  },
  {
    id: "ownership-leaderboard",
    title: "Ownership leaderboard",
    personas: ["ds-manager"],
    reportDataKey: "ownershipLeaderboard"
  },
  {
    id: "audience-changelog",
    title: "Changelog by audience",
    personas: ["product-designer", "product-manager", "product-engineer"],
    reportDataKey: "audienceChangelog"
  },
  {
    id: "frame-implementability",
    title: "Frame implementability",
    personas: ["product-designer", "product-engineer"],
    reportDataKey: "frameImplementability"
  },
  {
    id: "release-readiness",
    title: "Release readiness",
    personas: ["ds-engineer"],
    reportDataKey: "releaseReadiness"
  },
  {
    id: "data-freshness",
    title: "Data freshness",
    personas: ALL_PERSONAS,
    reportDataKey: "dataFreshness"
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
  drift: 25,
  lint: 25,
  readiness: 15,
  a11y: 15,
  adoption: 20,
  parity: 20
};
function resolveWeightProfile(viewName, scoreWeights, scoreWeightsByView) {
  if (viewName !== void 0 && scoreWeightsByView !== void 0) {
    const byView = scoreWeightsByView[viewName];
    if (byView !== void 0) {
      return { weights: byView, source: "view", name: viewName };
    }
  }
  if (scoreWeights !== void 0) {
    return { weights: scoreWeights, source: "project" };
  }
  return { weights: { ...DEFAULT_WEIGHTS }, source: "default" };
}
var COMPONENT_ORDER = [
  "drift",
  "lint",
  "readiness",
  "a11y",
  "adoption",
  "parity"
];
function asNumber(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function clamp01(value2) {
  return Math.min(100, Math.max(0, value2));
}
function roundHalfUp(value2) {
  return Math.round(value2);
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
    const value2 = obj[key];
    if (typeof value2 !== "number" || !Number.isFinite(value2)) {
      return { kind: "non-finite", key: typedKey };
    }
    if (value2 <= 0) {
      return { kind: "non-positive", key: typedKey };
    }
    weights[typedKey] = value2;
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
function adoptionScore(record) {
  const adoption = typeof record.adoption === "object" && record.adoption !== null ? record.adoption : void 0;
  if (adoption === void 0) return void 0;
  const refs = asNumber(adoption.refs);
  const literals = asNumber(adoption.literals);
  const total = refs + literals;
  if (total <= 0) return void 0;
  return 100 * refs / total;
}
function parityScore(record) {
  const total = asNumber(record.total);
  if (total <= 0) return void 0;
  if (typeof record.score === "number" && Number.isFinite(record.score)) {
    return clamp01(record.score);
  }
  const ok = asNumber(record.ok);
  return clamp01(100 * ok / total);
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
    case "parity":
      return "parity";
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
    case "adoption":
      return adoptionScore(record);
    case "parity":
      return parityScore(record);
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
  const display = components.map((c2) => ({
    ...c2,
    score: roundHalfUp(c2.score)
  }));
  return { current, components: display };
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
    if (component === "lint" && typeof record.adoption === "object" && record.adoption !== null) {
      entries.push({ component: "adoption", date, record });
    }
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
var TARGET_METRICS = [
  "on-system",
  "drift",
  "parity",
  "contrast",
  "readiness",
  "system-score"
];
var FRESHNESS_KINDS = [
  "drift",
  "lint",
  "readiness",
  "a11y",
  "impact",
  "adoption",
  "parity",
  "library-health",
  "changelog",
  "frame-impl"
];
var DEFAULT_FRESHNESS_THRESHOLDS = {
  drift: { aging: 14, stale: 30 },
  lint: { aging: 14, stale: 30 },
  readiness: { aging: 30, stale: 60 },
  a11y: { aging: 30, stale: 60 },
  impact: { aging: 14, stale: 30 },
  adoption: { aging: 14, stale: 30 },
  parity: { aging: 30, stale: 60 },
  "library-health": { aging: 30, stale: 60 },
  changelog: { aging: 30, stale: 60 },
  "frame-impl": { aging: 14, stale: 30 }
};
var DEFAULT_MIGRATION_SITES_CAP = 200;
var DEFAULT_SCORE_VELOCITY_WINDOW = 30;
var TARGET_OPS = [">=", "<=", "=="];
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
function suggestTargetMetrics(input, limit = 3) {
  const needle = input.toLowerCase();
  const MAX_DISTANCE = 4;
  return TARGET_METRICS.map((metric, index) => ({
    metric,
    index,
    prefix: metric.startsWith(needle),
    distance: editDistance2(needle, metric)
  })).filter((c2) => c2.prefix || c2.distance <= MAX_DISTANCE).sort(
    (a, b) => Number(b.prefix) - Number(a.prefix) || a.distance - b.distance || a.index - b.index
  ).slice(0, limit).map((c2) => c2.metric);
}
function suggestFreshnessKinds(input, limit = 3) {
  const needle = input.toLowerCase();
  const MAX_DISTANCE = 4;
  return FRESHNESS_KINDS.map((kind, index) => ({
    kind,
    index,
    prefix: kind.startsWith(needle),
    distance: editDistance2(needle, kind)
  })).filter((c2) => c2.prefix || c2.distance <= MAX_DISTANCE).sort(
    (a, b) => Number(b.prefix) - Number(a.prefix) || a.distance - b.distance || a.index - b.index
  ).slice(0, limit).map((c2) => c2.kind);
}
function isPlainObject4(value2) {
  return typeof value2 === "object" && value2 !== null && !Array.isArray(value2);
}
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
  const dashboardKeysPresent = ["dashboard_view", "dashboard_artifacts", "dashboard_default"].filter((k4) => obj[k4] !== void 0);
  if (dashboardKeysPresent.length > 1) {
    return {
      kind: "invalid",
      message: `${dashboardKeysPresent.join(", ")} are mutually exclusive \u2014 set exactly one, not ${dashboardKeysPresent.length}`
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
    const validated = validateArtifactIdList(
      obj.dashboard_artifacts,
      "dashboard_artifacts"
    );
    if (validated.kind === "invalid") return validated;
    values.dashboardArtifacts = validated.artifacts;
  }
  if (obj.dashboard_default !== void 0) {
    if (typeof obj.dashboard_default !== "string" || obj.dashboard_default === "") {
      return {
        kind: "invalid",
        message: "dashboard_default must be a non-empty string (a saved-dashboard name)"
      };
    }
    values.dashboardDefault = obj.dashboard_default;
  }
  if (obj.publish !== void 0) {
    if (!Array.isArray(obj.publish) || obj.publish.length === 0) {
      return {
        kind: "invalid",
        message: "publish must be a non-empty array of saved-dashboard names"
      };
    }
    const names = [];
    for (const entry of obj.publish) {
      if (typeof entry !== "string" || entry === "") {
        return {
          kind: "invalid",
          message: `publish must contain only non-empty strings, got ${JSON.stringify(entry)}`
        };
      }
      names.push(entry);
    }
    values.publish = names;
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
  if (obj.product_file_keys !== void 0) {
    if (!isPlainObject4(obj.product_file_keys)) {
      return {
        kind: "invalid",
        message: "product_file_keys must be an object of alias \u2192 Figma file key"
      };
    }
    const map = {};
    for (const [alias, key] of Object.entries(obj.product_file_keys)) {
      if (alias === "") {
        return {
          kind: "invalid",
          message: "product_file_keys has an empty alias \u2014 every alias must be a non-empty string"
        };
      }
      if (typeof key !== "string" || key === "") {
        return {
          kind: "invalid",
          message: `product_file_keys.${alias} must be a non-empty string (a Figma file key)`
        };
      }
      map[alias] = key;
    }
    values.productFileKeys = map;
  }
  if (obj.metric_targets !== void 0) {
    if (!isPlainObject4(obj.metric_targets)) {
      return {
        kind: "invalid",
        message: "metric_targets must be an object of metric \u2192 { op, value, warn? }"
      };
    }
    const targets = {};
    for (const [metric, target] of Object.entries(obj.metric_targets)) {
      if (!TARGET_METRICS.includes(metric)) {
        const suggestions = suggestTargetMetrics(metric);
        const hint = suggestions.length > 0 ? ` \u2014 did you mean ${suggestions.join(", ")}?` : "";
        return {
          kind: "invalid",
          message: `metric_targets has an unknown metric ${JSON.stringify(metric)}${hint}`
        };
      }
      if (!isPlainObject4(target)) {
        return {
          kind: "invalid",
          message: `metric_targets.${metric} must be an object { op, value, warn? }`
        };
      }
      if (!TARGET_OPS.includes(target.op)) {
        return {
          kind: "invalid",
          message: `metric_targets.${metric}.op must be one of ${TARGET_OPS.join(" | ")}, got ${JSON.stringify(target.op)}`
        };
      }
      if (typeof target.value !== "number" || !Number.isFinite(target.value)) {
        return {
          kind: "invalid",
          message: `metric_targets.${metric}.value must be a finite number`
        };
      }
      const parsed = {
        op: target.op,
        value: target.value
      };
      if (target.warn !== void 0) {
        if (typeof target.warn !== "number" || !Number.isFinite(target.warn)) {
          return {
            kind: "invalid",
            message: `metric_targets.${metric}.warn must be a finite number`
          };
        }
        parsed.warn = target.warn;
      }
      targets[metric] = parsed;
    }
    values.metricTargets = targets;
  }
  if (obj.score_weights_by_view !== void 0) {
    if (!isPlainObject4(obj.score_weights_by_view)) {
      return {
        kind: "invalid",
        message: "score_weights_by_view must be an object of view \u2192 weight overrides"
      };
    }
    const byView = {};
    for (const [view, override] of Object.entries(obj.score_weights_by_view)) {
      if (!isPlainObject4(override)) {
        return {
          kind: "invalid",
          message: `score_weights_by_view.${view} must be an object of component \u2192 weight`
        };
      }
      const weights = validateWeights(override);
      switch (weights.kind) {
        case "unknown-key":
          return {
            kind: "invalid",
            message: `score_weights_by_view.${view} has an unknown key ${JSON.stringify(weights.key)} \u2014 expected drift, lint, readiness, a11y or adoption`
          };
        case "non-positive":
          return {
            kind: "invalid",
            message: `score_weights_by_view.${view}.${weights.key} must be a positive number`
          };
        case "non-finite":
          return {
            kind: "invalid",
            message: `score_weights_by_view.${view}.${weights.key} must be a finite number`
          };
        case "ok":
          byView[view] = weights.weights;
          break;
      }
    }
    values.scoreWeightsByView = byView;
  }
  if (obj.freshness_thresholds !== void 0) {
    if (!isPlainObject4(obj.freshness_thresholds)) {
      return {
        kind: "invalid",
        message: "freshness_thresholds must be an object of check-kind \u2192 { aging, stale }"
      };
    }
    const thresholds = {};
    for (const [kind, band] of Object.entries(obj.freshness_thresholds)) {
      if (!FRESHNESS_KINDS.includes(kind)) {
        const suggestions = suggestFreshnessKinds(kind);
        const hint = suggestions.length > 0 ? ` \u2014 did you mean ${suggestions.join(", ")}?` : "";
        return {
          kind: "invalid",
          message: `freshness_thresholds has an unknown check-kind ${JSON.stringify(kind)}${hint}`
        };
      }
      if (!isPlainObject4(band)) {
        return {
          kind: "invalid",
          message: `freshness_thresholds.${kind} must be an object { aging, stale }`
        };
      }
      const { aging, stale } = band;
      for (const [name, value2] of [
        ["aging", aging],
        ["stale", stale]
      ]) {
        if (typeof value2 !== "number" || !Number.isFinite(value2) || value2 <= 0) {
          return {
            kind: "invalid",
            message: `freshness_thresholds.${kind}.${name} must be a positive finite number`
          };
        }
      }
      if (aging > stale) {
        return {
          kind: "invalid",
          message: `freshness_thresholds.${kind}.aging must be \u2264 stale`
        };
      }
      thresholds[kind] = {
        aging,
        stale
      };
    }
    values.freshnessThresholds = thresholds;
  }
  if (obj.ownership !== void 0) {
    if (!Array.isArray(obj.ownership)) {
      return {
        kind: "invalid",
        message: "ownership must be an array of { owner, paths } rules"
      };
    }
    const rules = [];
    for (let i = 0; i < obj.ownership.length; i += 1) {
      const entry = obj.ownership[i];
      if (!isPlainObject4(entry)) {
        return {
          kind: "invalid",
          message: `ownership[${i}] must be an object { owner, paths }`
        };
      }
      if (typeof entry.owner !== "string" || entry.owner === "") {
        return {
          kind: "invalid",
          message: `ownership[${i}].owner must be a non-empty string`
        };
      }
      if (!Array.isArray(entry.paths) || entry.paths.length === 0) {
        return {
          kind: "invalid",
          message: `ownership[${i}].paths must be a non-empty array of path globs`
        };
      }
      const paths = [];
      for (let j = 0; j < entry.paths.length; j += 1) {
        const path = entry.paths[j];
        if (typeof path !== "string" || path === "") {
          return {
            kind: "invalid",
            message: `ownership[${i}].paths[${j}] must be a non-empty string (a path glob)`
          };
        }
        paths.push(path);
      }
      rules.push({ owner: entry.owner, paths });
    }
    values.ownership = rules;
  }
  if (obj.ownership_file !== void 0) {
    if (typeof obj.ownership_file !== "string" || obj.ownership_file === "") {
      return {
        kind: "invalid",
        message: "ownership_file must be a non-empty string (a path)"
      };
    }
    values.ownershipFile = obj.ownership_file;
  }
  if (obj.component_aliases !== void 0) {
    if (!isPlainObject4(obj.component_aliases)) {
      return {
        kind: "invalid",
        message: "component_aliases must be an object of component \u2192 { frameName?, contrastMode? }"
      };
    }
    const map = {};
    for (const [alias, keys] of Object.entries(obj.component_aliases)) {
      if (!isPlainObject4(keys)) {
        return {
          kind: "invalid",
          message: `component_aliases.${alias} must be an object { frameName?, contrastMode? }`
        };
      }
      const entry = {};
      for (const field of ["frameName", "contrastMode"]) {
        const value2 = keys[field];
        if (value2 === void 0) continue;
        if (typeof value2 !== "string" || value2 === "") {
          return {
            kind: "invalid",
            message: `component_aliases.${alias}.${field} must be a non-empty string`
          };
        }
        entry[field] = value2;
      }
      map[alias] = entry;
    }
    values.componentAliases = map;
  }
  if (obj.migration_sites_cap !== void 0) {
    const n = obj.migration_sites_cap;
    if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
      return {
        kind: "invalid",
        message: `migration_sites_cap must be a positive integer, got ${JSON.stringify(n)}`
      };
    }
    values.migrationSitesCap = n;
  }
  if (obj.score_velocity_window !== void 0) {
    const n = obj.score_velocity_window;
    if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
      return {
        kind: "invalid",
        message: `score_velocity_window must be a positive integer number of days, got ${JSON.stringify(n)}`
      };
    }
    values.scoreVelocityWindow = n;
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
  const productFileKeys = {
    ...project.productFileKeys ?? {}
  };
  const PRODUCT_FILE_ENV_PREFIX = "FIGMA_PRODUCT_FILE_";
  for (const envKey of Object.keys(env)) {
    if (!envKey.startsWith(PRODUCT_FILE_ENV_PREFIX)) continue;
    const value2 = env[envKey];
    if (value2 === void 0 || value2 === "") continue;
    const alias = envKey.slice(PRODUCT_FILE_ENV_PREFIX.length).toLowerCase();
    if (alias === "") continue;
    productFileKeys[alias] = value2;
  }
  const config = {
    figmaFileKey: flags.figmaFileKey ?? env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY ?? env.FIGMA_DESIGN_SYSTEM_FILE ?? project.figmaFileKey,
    figmaToken: tokenValue !== void 0 && tokenValue !== "" ? { kind: "present", value: tokenValue } : { kind: "missing" },
    tokenSource: flags.tokenSource ?? env.CLAUDE_PLUGIN_OPTION_TOKEN_SOURCE ?? project.tokenSource,
    reportStyle: flags.reportStyle ?? envReportStyle ?? project.reportStyle ?? DEFAULTS.reportStyle,
    readinessThreshold: flags.readinessThreshold ?? envThreshold ?? project.readinessThreshold ?? DEFAULTS.readinessThreshold,
    // Dashboard selection comes only from the project file (SPEC-measure §3:
    // no env vars, no userConfig). The flags > config > `everything` default
    // is applied downstream by resolveView (M0.2), not here. The three keys
    // are mutually exclusive at parse time, so at most one is set.
    dashboardView: project.dashboardView,
    dashboardArtifacts: project.dashboardArtifacts,
    dashboardDefault: project.dashboardDefault,
    publish: project.publish,
    // The merged/validated weights, or undefined when score_weights is absent
    // (callers fall back to the engine defaults in that case).
    scoreWeights: project.scoreWeights,
    // Project-file map merged with the FIGMA_PRODUCT_FILE_<NAME> env family
    // (env wins). Always an object — defaults to {} when no source provides one.
    productFileKeys,
    // Persona-wave project-file-only keys (SPEC-personas §6.5). Each is
    // undefined when absent (the caller falls back to its own defaults), except
    // the capped/windowed numbers which carry hard defaults.
    metricTargets: project.metricTargets,
    scoreWeightsByView: project.scoreWeightsByView,
    freshnessThresholds: project.freshnessThresholds,
    ownership: project.ownership,
    ownershipFile: project.ownershipFile,
    componentAliases: project.componentAliases,
    migrationSitesCap: project.migrationSitesCap ?? DEFAULT_MIGRATION_SITES_CAP,
    scoreVelocityWindow: project.scoreVelocityWindow ?? DEFAULT_SCORE_VELOCITY_WINDOW
  };
  return { kind: "ok", config, warnings };
}
var PROJECT_FILE_NAME = ".ds-bridge.json";
function validateArtifactIdList(entries, label) {
  const artifacts = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      return {
        kind: "invalid",
        message: `${label} must contain only strings, got ${JSON.stringify(entry)}`
      };
    }
    const lookup = lookupArtifact(entry);
    if (lookup.kind === "unknown") {
      const hint = lookup.suggestions.length > 0 ? ` \u2014 did you mean ${lookup.suggestions.join(", ")}?` : "";
      return {
        kind: "invalid",
        message: `${label} has an unknown artifact id ${JSON.stringify(entry)}${hint}`
      };
    }
    artifacts.push(lookup.artifact.id);
  }
  return { kind: "ok", artifacts };
}
function parseSelectionFile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: "invalid", message: "dashboard file is not valid JSON" };
  }
  if (!isPlainObject4(raw)) {
    return { kind: "invalid", message: "dashboard file must be a JSON object" };
  }
  const obj = raw;
  const hasView = obj.view !== void 0;
  const hasArtifacts = obj.artifacts !== void 0;
  if (hasView && hasArtifacts) {
    return {
      kind: "invalid",
      message: "view and artifacts are mutually exclusive \u2014 set exactly one"
    };
  }
  if (!hasView && !hasArtifacts) {
    return {
      kind: "invalid",
      message: "dashboard file must set either view or artifacts"
    };
  }
  if (hasView) {
    if (typeof obj.view !== "string" || obj.view === "") {
      return {
        kind: "invalid",
        message: "view must be a non-empty string (a preset name)"
      };
    }
    return { kind: "view", view: obj.view };
  }
  if (!Array.isArray(obj.artifacts)) {
    return {
      kind: "invalid",
      message: "artifacts must be an array of artifact ids"
    };
  }
  const validated = validateArtifactIdList(obj.artifacts, "artifacts");
  if (validated.kind === "invalid") return validated;
  return { kind: "artifacts", artifacts: validated.artifacts };
}
function atomicWriteJson(filePath, obj) {
  const text = `${JSON.stringify(obj, null, 2)}
`;
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, text, "utf8");
  renameSync(tempPath, filePath);
}
function writeProjectConfig(dir, patch) {
  const filePath = join4(dir, PROJECT_FILE_NAME);
  let existing = {};
  if (existsSync3(filePath)) {
    const raw = JSON.parse(readFileSync3(filePath, "utf8"));
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      existing = raw;
    }
  }
  const merged = { ...existing };
  for (const [key, value2] of Object.entries(patch)) {
    if (value2 === void 0) {
      delete merged[key];
    } else {
      merged[key] = value2;
    }
  }
  atomicWriteJson(filePath, merged);
}

// src/engines/report/presets.ts
function presetFor(persona) {
  return CATALOG.filter(
    (meta) => meta.personas.includes(persona)
  ).map((meta) => meta.id);
}
var PRESETS = {
  "ds-designer": presetFor("ds-designer"),
  "ds-manager": presetFor("ds-manager"),
  "ds-engineer": presetFor("ds-engineer"),
  "product-designer": presetFor("product-designer"),
  "product-manager": presetFor("product-manager"),
  "product-engineer": presetFor("product-engineer"),
  everything: [...ALL_ARTIFACT_IDS]
};
var PRESET_NAMES = Object.keys(PRESETS);
var PRESET_DESCRIPTIONS = {
  "ds-designer": "Authors the Figma library; needs it clean, handoff-ready, accessible, and in parity with code.",
  "ds-manager": "DesignOps governance: health, adoption, targets, ownership, and release comms across teams.",
  "ds-engineer": "Owns tokens\u2194code and Figma\u2194code parity; source of breaking changes; pre-publish gatekeeper.",
  "product-designer": "Designs product screens by consuming the library; tracks what is safe to build on and when it breaks.",
  "product-manager": "Delivery/risk owner; tracks adoption and upstream breakage against targets.",
  "product-engineer": "Builds product UI from the DS-code package; works a migration queue of breaking changes.",
  everything: "The full 24-artifact catalog \u2014 the no-setup escape for an unconfigured repo."
};
function editDistance3(a, b) {
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
    distance: editDistance3(needle, name)
  })).filter((c2) => c2.prefix || c2.distance <= MAX_DISTANCE).sort(
    (a, b) => Number(b.prefix) - Number(a.prefix) || a.distance - b.distance || a.index - b.index
  ).slice(0, limit).map((c2) => c2.name);
}
function isPresetName(value2) {
  return Object.hasOwn(PRESETS, value2);
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
function escapeXml(value2) {
  return value2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function clamp2(value2, min, max) {
  if (value2 < min) return min;
  if (value2 > max) return max;
  return value2;
}
function roundHalfUp2(value2) {
  return Math.round(value2);
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
function fail3(message) {
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
  const configPath = join5(targetDir, ".ds-bridge.json");
  if (!existsSync4(configPath)) return void 0;
  try {
    return readFileSync4(configPath, "utf8");
  } catch {
    return void 0;
  }
}
function runBadge(path, options) {
  const targetDir = resolve6(path);
  if (!existsSync4(targetDir) || !statSync3(targetDir).isDirectory()) {
    fail3(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const stateDir = join5(targetDir, ".ds-bridge");
  const historyPath = join5(stateDir, "history.jsonl");
  let historyText;
  try {
    historyText = readFileSync4(historyPath, "utf8");
  } catch {
    fail3(noDataMessage(historyPath));
    return;
  }
  const projectFileText = readProjectConfigText(targetDir);
  let weightProfile = resolveWeightProfile(void 0, void 0, void 0);
  if (projectFileText !== void 0) {
    const resolved = resolveConfig({ projectFileText });
    if (resolved.kind !== "ok") {
      fail3(resolved.message);
      return;
    }
    const cfg = resolved.config;
    const view = resolveView(
      {},
      {
        ...cfg.dashboardView !== void 0 ? { view: cfg.dashboardView } : {},
        ...cfg.dashboardArtifacts !== void 0 ? { artifacts: cfg.dashboardArtifacts } : {}
      }
    );
    const viewName = view.kind === "ok" && view.source !== "default" ? view.viewName : void 0;
    weightProfile = resolveWeightProfile(
      viewName,
      cfg.scoreWeights,
      cfg.scoreWeightsByView
    );
  }
  const outcome = scoreFromHistory(historyText, weightProfile.weights);
  if (outcome.kind === "no-data") {
    fail3(noDataMessage(historyPath));
    return;
  }
  const svg = renderBadge({ score: outcome.current });
  const outPath = options.out !== void 0 ? resolve6(options.out) : join5(stateDir, "badge.svg");
  try {
    mkdirSync3(dirname2(outPath), { recursive: true });
    writeFileSync2(outPath, svg, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail3(`Could not write badge to "${outPath}": ${detail}`);
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
import { appendFileSync as appendFileSync3, mkdirSync as mkdirSync4 } from "fs";
import { join as join6 } from "path";
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
function toIso(value2) {
  const ms = Date.parse(value2);
  if (Number.isNaN(ms)) return value2;
  return new Date(ms).toISOString();
}
function withinSince(dateIso, since) {
  const at = Date.parse(dateIso);
  const from = Date.parse(since);
  if (Number.isNaN(at) || Number.isNaN(from)) return true;
  return at >= from;
}
function valuePreview(token) {
  const { value: value2 } = token;
  if (typeof value2 === "string" || typeof value2 === "number")
    return String(value2);
  return JSON.stringify(value2);
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
  const description = (version.description ?? "").trim();
  return withDetail(
    {
      id: `figma:${version.id}`,
      dateIso: toIso(version.created_at),
      source: "figma",
      audience: "designer",
      severity: "notable",
      title: (version.label ?? "").trim()
    },
    description === "" ? void 0 : description
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
    if ((version.label ?? "").trim() === "") continue;
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
  return new Promise((resolve13) => setTimeout(resolve13, ms));
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
function classifyGitFailure(run) {
  if (run.error !== void 0) {
    return { kind: "git-error", message: run.error };
  }
  const stderr = run.stderr;
  if (stderr.includes("does not exist in") || stderr.includes("exists on disk, but not in")) {
    return { kind: "missing", message: stderr };
  }
  return { kind: "git-error", message: stderr.trim() };
}
function readFileAtRef(input) {
  const { ref, path, cwd: cwd5, exec } = input;
  const prefixRun = exec(["rev-parse", "--show-prefix"], cwd5);
  if (prefixRun.error !== void 0 || prefixRun.status !== 0) {
    const { kind, message } = classifyGitFailure(prefixRun);
    return kind === "missing" ? { kind: "missing" } : { kind, message };
  }
  const prefix = prefixRun.stdout.trim();
  const showRun = exec(["show", `${ref}:${prefix}${path}`], cwd5);
  if (showRun.error !== void 0 || showRun.status !== 0) {
    const { kind, message } = classifyGitFailure(showRun);
    return kind === "missing" ? { kind: "missing" } : { kind, message };
  }
  return { kind: "ok", text: showRun.stdout };
}
function spawnGitExec(args, cwd5) {
  const run = spawnSync("git", args, { cwd: cwd5, encoding: "utf8" });
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
var HISTORY_RECENT_LIMIT = 12;
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
function renderTerm3(entries, audience, color) {
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
function breakingRank(severity) {
  return severity === "breaking" ? 0 : 1;
}
function tally(counts, severity) {
  counts[severity] += 1;
}
function buildChangelogHistoryRecord(entries, since, at) {
  const designer = {
    breaking: 0,
    notable: 0,
    minor: 0
  };
  const developer = {
    breaking: 0,
    notable: 0,
    minor: 0
  };
  const both = { breaking: 0, notable: 0, minor: 0 };
  for (const entry of entries) {
    if (entry.audience === "designer") tally(designer, entry.severity);
    else if (entry.audience === "developer") tally(developer, entry.severity);
    else tally(both, entry.severity);
  }
  const recent = entries.map((entry, order) => ({ entry, order })).sort(
    (a, b) => breakingRank(a.entry.severity) - breakingRank(b.entry.severity) || a.order - b.order
  ).slice(0, HISTORY_RECENT_LIMIT).map(({ entry }) => ({
    audience: entry.audience,
    severity: entry.severity,
    source: entry.source,
    title: entry.title
  }));
  return {
    at,
    kind: "changelog",
    since,
    designer,
    developer,
    both,
    recent
  };
}
function appendChangelogHistory(deps, record) {
  const stateDir = join6(deps.cwd, ".ds-bridge");
  mkdirSync4(stateDir, { recursive: true });
  appendFileSync3(
    join6(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
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
  if (options.history) {
    appendChangelogHistory(
      deps,
      buildChangelogHistoryRecord(all, since, deps.now().toISOString())
    );
  }
  if (format === "json") {
    deps.stdout(`${JSON.stringify({ since, entries }, null, 2)}
`);
  } else if (format === "md") {
    deps.stdout(renderChangelogMarkdown(entries, { audience: audience.value }));
  } else {
    const color = shouldColor(deps.env, Boolean(process.stdout.isTTY));
    deps.stdout(`${renderTerm3(entries, audience.value, color)}
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
  ).option("--audience <who>", "designers | developers | both", "both").option("--format <format>", "output format: term | json | md", "term").option(
    "--no-history",
    "do not append a changelog record to .ds-bridge/history.jsonl in the current directory"
  ).action((options) => {
    void runChangelog(options, defaultDeps());
  });
}

// src/cli-commands/config.ts
import {
  chmodSync,
  existsSync as existsSync5,
  readFileSync as readFileSync6,
  renameSync as renameSync2,
  unlinkSync,
  writeFileSync as writeFileSync3
} from "fs";
import { join as join7, resolve as resolvePath } from "path";

// src/io/dotenv.ts
import { readFileSync as readFileSync5 } from "fs";
function parseDotenv(text) {
  const out = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key === "") continue;
    out[key] = stripOneQuoteLayer(line.slice(eq + 1).trim());
  }
  return out;
}
function stripOneQuoteLayer(value2) {
  if (value2.length < 2) return value2;
  const first = value2[0];
  const last = value2[value2.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    return value2.slice(1, -1);
  }
  return value2;
}
function loadDotenvInto(filePath, env) {
  let text;
  try {
    text = readFileSync5(filePath, "utf8");
  } catch {
    return;
  }
  for (const [key, value2] of Object.entries(parseDotenv(text))) {
    const current = env[key];
    if (current === void 0 || current === "") {
      env[key] = value2;
    }
  }
}

// src/cli-commands/config.ts
var ENV_FILE_NAME = ".ds-bridge.env";
function fail4(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function maskToken(token) {
  if (token.length <= 8) return "*".repeat(token.length);
  const head = token.slice(0, 5);
  const tail = token.slice(-4);
  return `${head}\u2026${tail}`;
}
function serializeDotenv(map) {
  return `${Object.entries(map).map(([key, value2]) => `${key}=${value2}`).join("\n")}
`;
}
function writeEnvFileMerged(dir, updates) {
  const filePath = join7(dir, ENV_FILE_NAME);
  const existing = existsSync5(filePath) ? parseDotenv(readFileSync6(filePath, "utf8")) : {};
  const merged = { ...existing, ...updates };
  const text = serializeDotenv(merged);
  const tempPath = join7(dir, `${ENV_FILE_NAME}.${process.pid}.tmp`);
  try {
    writeFileSync3(tempPath, text, { encoding: "utf8", mode: 384 });
    renameSync2(tempPath, filePath);
  } catch (error) {
    try {
      if (existsSync5(tempPath)) unlinkSync(tempPath);
    } catch {
    }
    throw error;
  }
  chmodSync(filePath, 384);
}
function runPersistToken(path) {
  const env = process.env;
  const token = env.CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN ?? env.FIGMA_TOKEN ?? void 0;
  if (token === void 0 || token === "") {
    fail4(
      "No Figma token in this session's environment. Configure it in the plugin dialog (`/plugin configure`) first, then run this in the SAME session."
    );
    return;
  }
  const fileKey = env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY ?? env.FIGMA_DESIGN_SYSTEM_FILE ?? void 0;
  const targetDir = resolvePath(path);
  const updates = { FIGMA_TOKEN: token };
  if (fileKey !== void 0 && fileKey !== "") {
    updates.FIGMA_DESIGN_SYSTEM_FILE = fileKey;
  }
  try {
    writeEnvFileMerged(targetDir, updates);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail4(`Could not write ${join7(targetDir, ENV_FILE_NAME)}: ${detail}`);
    return;
  }
  const savedKey = updates.FIGMA_DESIGN_SYSTEM_FILE !== void 0 ? " and the design-system file key" : "";
  process.stdout.write(
    `Saved Figma token (${maskToken(token)})${savedKey} to ${join7(targetDir, ENV_FILE_NAME)} (gitignored, mode 0600). It now survives a restart; the live plugin-dialog value still wins when present.
`
  );
  process.exitCode = 0;
}
function registerConfigCommand(program2) {
  const config = program2.command("config").description("Manage ds-bridge project configuration");
  config.command("persist-token").description(
    "Save this session's Figma token to .ds-bridge.env (gitignored, 0600) so it survives a restart (opt-in fix for Claude Code #62442)"
  ).argument("[path]", "project directory to write .ds-bridge.env into", ".").action((path) => {
    runPersistToken(path);
  });
}

// src/cli-commands/dashboard.ts
import { appendFileSync as appendFileSync4, existsSync as existsSync7, readFileSync as readFileSync9, unlinkSync as unlinkSync2 } from "fs";
import { join as join10, resolve as resolvePath2 } from "path";

// src/engines/report/nl-match.ts
function tokenize2(phrase) {
  return (phrase.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length >= 3
  );
}
function matchPhrase(phrase) {
  const tokens = tokenize2(phrase);
  if (tokens.length === 0) return [];
  const matches = [];
  for (const meta of CATALOG) {
    const haystack = `${meta.id} ${meta.title}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) {
        score += 2;
      } else if (suggestArtifactIds(token, 3).includes(meta.id)) {
        score += 1;
      }
    }
    if (score > 0) matches.push({ id: meta.id, title: meta.title, score });
  }
  return matches.sort((a, b) => b.score - a.score);
}

// src/io/dashboards.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync5, readdirSync, readFileSync as readFileSync7 } from "fs";
import { join as join8 } from "path";
var DASHBOARDS_DIR = "dashboards";
var REPORT_TYPES = ["html", "md", "terminal", "site"];
function dashboardPath(dir, name, local) {
  const suffix = local ? ".local.json" : ".json";
  return join8(dir, DASHBOARDS_DIR, `${name}${suffix}`);
}
function writeDashboardFile(dir, name, selection, opts = {}) {
  mkdirSync5(join8(dir, DASHBOARDS_DIR), { recursive: true });
  const obj = { name };
  if (selection.view !== void 0) obj.view = selection.view;
  if (selection.artifacts !== void 0)
    obj.artifacts = [...selection.artifacts];
  const meta = opts.meta;
  if (meta?.persona !== void 0) obj.persona = meta.persona;
  if (meta?.report_type !== void 0) obj.report_type = meta.report_type;
  if (meta?.audience !== void 0) obj.audience = meta.audience;
  if (meta?.score_weights !== void 0) obj.score_weights = meta.score_weights;
  atomicWriteJson(dashboardPath(dir, name, opts.local ?? false), obj);
}
function parseDashboard(text, fallbackName) {
  const selectionOutcome = parseSelectionFile(text);
  if (selectionOutcome.kind === "invalid") {
    return { kind: "invalid", message: selectionOutcome.message };
  }
  const obj = JSON.parse(text);
  const selection = selectionOutcome.kind === "view" ? { kind: "view", view: selectionOutcome.view } : { kind: "artifacts", artifacts: selectionOutcome.artifacts };
  const dashboard = {
    name: typeof obj.name === "string" && obj.name !== "" ? obj.name : fallbackName,
    selection
  };
  if (obj.report_type !== void 0) {
    if (!REPORT_TYPES.includes(obj.report_type)) {
      return {
        kind: "invalid",
        message: `report_type must be one of ${REPORT_TYPES.join(", ")}`
      };
    }
    dashboard.reportType = obj.report_type;
  }
  if (obj.audience !== void 0) {
    if (typeof obj.audience !== "string") {
      return { kind: "invalid", message: "audience must be a string" };
    }
    dashboard.audience = obj.audience;
  }
  if (obj.persona !== void 0) {
    if (typeof obj.persona !== "string") {
      return { kind: "invalid", message: "persona must be a string" };
    }
    dashboard.persona = obj.persona;
  }
  if (obj.score_weights !== void 0) {
    const weights = validateWeights(obj.score_weights);
    if (weights.kind !== "ok") {
      return {
        kind: "invalid",
        message: `score_weights is invalid (${weights.kind}${"key" in weights ? `: ${weights.key}` : ""})`
      };
    }
    dashboard.scoreWeights = obj.score_weights;
  }
  return { kind: "ok", dashboard };
}
function readDashboardFile(dir, name) {
  const localPath = dashboardPath(dir, name, true);
  const sharedPath = dashboardPath(dir, name, false);
  const path = existsSync6(localPath) ? localPath : existsSync6(sharedPath) ? sharedPath : void 0;
  if (path === void 0) return { kind: "not-found" };
  let text;
  try {
    text = readFileSync7(path, "utf8");
  } catch {
    return { kind: "not-found" };
  }
  return parseDashboard(text, name);
}
function listDashboards(dir) {
  let files;
  try {
    files = readdirSync(join8(dir, DASHBOARDS_DIR));
  } catch {
    return [];
  }
  const byName2 = /* @__PURE__ */ new Map();
  const entryFor = (name) => {
    const existing = byName2.get(name);
    if (existing !== void 0) return existing;
    const created = { name, hasShared: false, hasLocal: false };
    byName2.set(name, created);
    return created;
  };
  for (const file of files) {
    if (file.endsWith(".local.json")) {
      entryFor(file.slice(0, -".local.json".length)).hasLocal = true;
    } else if (file.endsWith(".json")) {
      entryFor(file.slice(0, -".json".length)).hasShared = true;
    }
  }
  return [...byName2.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// src/cli-commands/dashboard-wizard.ts
import { readFileSync as readFileSync8 } from "fs";
import { join as join9 } from "path";
import { createInterface } from "readline/promises";
var PRODUCER_PERSONAS = /* @__PURE__ */ new Set([
  "ds-designer",
  "ds-manager",
  "ds-engineer"
]);
var PERSONA_AUDIENCE = {
  "ds-designer": "designers",
  "ds-manager": "both",
  "ds-engineer": "developers",
  "product-designer": "designers",
  "product-manager": "both",
  "product-engineer": "developers"
};
var PROJECT_FILE_NAME2 = ".ds-bridge.json";
function readExistingProductFileKeys(dir) {
  try {
    const raw = JSON.parse(
      readFileSync8(join9(dir, PROJECT_FILE_NAME2), "utf8")
    );
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      const pfk = raw.product_file_keys;
      if (typeof pfk === "object" && pfk !== null && !Array.isArray(pfk)) {
        const out = {};
        for (const [alias, key] of Object.entries(pfk)) {
          if (typeof key === "string") out[alias] = key;
        }
        return out;
      }
    }
  } catch {
  }
  return {};
}
var LineReader = class {
  queue = [];
  waiting;
  closed = false;
  constructor(rl) {
    rl.on("line", (line) => {
      if (this.waiting !== void 0) {
        const { resolve: resolve13 } = this.waiting;
        this.waiting = void 0;
        resolve13(line);
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
    return new Promise((resolve13, reject) => {
      this.waiting = { resolve: resolve13, reject };
    });
  }
};
var EofError = class extends Error {
};
async function ask(reader, output, prompt) {
  output.write(prompt);
  return reader.next();
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
async function captureFileKeys(reader, output, cwd5, persona) {
  if (PRODUCER_PERSONAS.has(persona)) {
    const hasKey = isYes(
      await ask(
        reader,
        output,
        "Is your DS library file key configured (FIGMA_DESIGN_SYSTEM_FILE / figma_file_key)? (y/N) "
      )
    );
    if (!hasKey) {
      output.write(
        "Heads up: library-health, parity, a11y, impact, and docs stay empty until figma_file_key is set.\n"
      );
    }
    return void 0;
  }
  const alias = (await ask(
    reader,
    output,
    "Name an alias for your product Figma file (e.g. web), or leave blank to skip: "
  )).trim();
  if (alias === "") return void 0;
  const key = (await ask(reader, output, `Figma file key for "${alias}": `)).trim();
  if (key === "") {
    output.write("No file key entered \u2014 skipping the product file pin.\n");
    return void 0;
  }
  return { ...readExistingProductFileKeys(cwd5), [alias]: key };
}
async function runSetupWizard(deps) {
  const { input, output, cwd: cwd5, isTTY } = deps;
  if (!isTTY) {
    output.write(
      "The setup wizard needs an interactive terminal. Use `ds-bridge dashboard set --view <preset>` instead.\n"
    );
    return { exitCode: 2 };
  }
  const rl = createInterface({ input, output });
  const reader = new LineReader(rl);
  try {
    const preset = await pickPreset(reader, output);
    if (preset === "everything") {
      output.write(
        "`everything` needs no setup \u2014 an unconfigured repo already renders the full catalog.\n"
      );
      return { exitCode: 0 };
    }
    const productFileKeys = await captureFileKeys(reader, output, cwd5, preset);
    const confirmed = isYes(
      await ask(reader, output, `Save the "${preset}" view? (y/N) `)
    );
    if (!confirmed) {
      output.write("No changes made.\n");
      return { exitCode: 0 };
    }
    writeProjectConfig(cwd5, {
      dashboard_view: preset,
      dashboard_artifacts: void 0,
      dashboard_default: void 0,
      ...productFileKeys !== void 0 ? { product_file_keys: productFileKeys } : {}
    });
    output.write(`Saved. Your dashboard view is now "${preset}".
`);
    output.write(
      `Default --audience for ${preset}: ${PERSONA_AUDIENCE[preset]} (changelog/digest).
`
    );
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
function fail5(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
var PROJECT_FILE_NAME3 = ".ds-bridge.json";
function readSelection(targetDir) {
  const configPath = join10(targetDir, PROJECT_FILE_NAME3);
  let projectFileText;
  if (existsSync7(configPath)) {
    try {
      projectFileText = readFileSync9(configPath, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        kind: "error",
        message: `Could not read ${PROJECT_FILE_NAME3} at "${configPath}": ${detail}`
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
function listPresets() {
  return PRESET_NAMES.map((name) => ({
    name,
    description: PRESET_DESCRIPTIONS[name],
    artifacts: [...PRESETS[name]]
  }));
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
  return { artifacts, presets: listPresets(), view };
}
function renderTerm4(data) {
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
    fail5(`Unknown --format "${options.format}". Expected "term" or "json".`);
    return;
  }
  const targetDir = resolvePath2(path);
  const selection = readSelection(targetDir);
  if (selection.kind === "error") {
    fail5(selection.message);
    return;
  }
  const data = toListJson(selection.selection);
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(data, null, 2)}
`);
  } else {
    process.stdout.write(`${renderTerm4(data)}
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
    fail5("--view and --artifacts are mutually exclusive \u2014 set one, not both.");
    return;
  }
  if (!hasView && !hasArtifacts) {
    fail5(
      "Specify a view or an artifact list: --view <preset> | --artifacts <a,b,\u2026>."
    );
    return;
  }
  const targetDir = resolvePath2(path);
  if (hasView) {
    const view = options.view;
    const resolved = resolveView({ view }, {});
    if (resolved.kind === "unknown-view") {
      const hint = resolved.suggestions.length > 0 ? ` \u2014 did you mean ${resolved.suggestions.join(", ")}?` : "";
      fail5(`Unknown view "${view}"${hint}`);
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
    fail5(parsed.message);
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
function runEditDashboard(targetDir, name, id, mode) {
  const read = readDashboardFile(targetDir, name);
  if (read.kind === "not-found") {
    failUnknownDashboard(targetDir, name);
    return;
  }
  if (read.kind === "invalid") {
    fail5(`Dashboard "${name}" is invalid: ${read.message}`);
    return;
  }
  const sel = read.dashboard.selection;
  const resolved = resolveView(
    sel.kind === "view" ? { view: sel.view } : { artifacts: sel.artifacts },
    {}
  );
  if (resolved.kind !== "ok") {
    fail5(`Dashboard "${name}" has an unresolvable selection.`);
    return;
  }
  const before = resolved.artifacts;
  const present = before.includes(id);
  if (mode === "add" && present) {
    process.stdout.write(`"${id}" is already in "${name}" \u2014 no change.
`);
    process.exitCode = 0;
    return;
  }
  if (mode === "remove" && !present) {
    process.stdout.write(`"${id}" is not in "${name}" \u2014 no change.
`);
    process.exitCode = 0;
    return;
  }
  const next = mode === "add" ? [...before, id] : before.filter((existing) => existing !== id);
  const entry = listDashboards(targetDir).find((e4) => e4.name === name);
  const local = entry !== void 0 && !entry.hasShared && entry.hasLocal;
  writeDashboardFile(
    targetDir,
    name,
    { artifacts: next },
    { local, meta: metaFrom(read.dashboard) }
  );
  const verb = mode === "add" ? "Added" : "Removed";
  process.stdout.write(
    `${verb} "${id}" in "${name}". View: ${next.join(", ")}.
`
  );
  process.exitCode = 0;
}
function runEdit(path, rawId, mode, dashboardName) {
  const outcome = lookupArtifact(rawId);
  if (outcome.kind === "unknown") {
    const hint = outcome.suggestions.length > 0 ? ` \u2014 did you mean ${outcome.suggestions.join(", ")}?` : "";
    fail5(`Unknown artifact id "${rawId}"${hint}`);
    return;
  }
  const id = outcome.artifact.id;
  const targetDir = resolvePath2(path);
  if (dashboardName !== void 0) {
    runEditDashboard(targetDir, dashboardName, id, mode);
    return;
  }
  const current = readSelection(targetDir);
  if (current.kind === "error") {
    fail5(current.message);
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
function failUnknownDashboard(targetDir, name) {
  const names = listDashboards(targetDir).map((e4) => e4.name);
  const available = names.length > 0 ? ` Available: ${names.join(", ")}.` : " No saved dashboards in dashboards/.";
  fail5(`Unknown dashboard "${name}".${available}`);
}
function metaFrom(dashboard) {
  const meta = {};
  if (dashboard.persona !== void 0) meta.persona = dashboard.persona;
  if (dashboard.reportType !== void 0)
    meta.report_type = dashboard.reportType;
  if (dashboard.audience !== void 0) meta.audience = dashboard.audience;
  if (dashboard.scoreWeights !== void 0) {
    meta.score_weights = dashboard.scoreWeights;
  }
  return meta;
}
function ensureLocalGitignore(targetDir) {
  const gitignorePath = join10(targetDir, ".gitignore");
  const line = "dashboards/*.local.json";
  let existing = "";
  if (existsSync7(gitignorePath)) {
    existing = readFileSync9(gitignorePath, "utf8");
    if (existing.split(/\r?\n/).some((l) => l.trim() === line)) return;
  }
  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  appendFileSync4(gitignorePath, `${prefix}${line}
`, "utf8");
}
function runSave(name, path, options) {
  const targetDir = resolvePath2(path);
  if (options.view !== void 0 && options.artifacts !== void 0) {
    fail5("--view and --artifacts are mutually exclusive \u2014 set one, not both.");
    return;
  }
  let selection;
  if (options.view !== void 0) {
    const resolved = resolveView({ view: options.view }, {});
    if (resolved.kind !== "ok") {
      const hint = resolved.kind === "unknown-view" && resolved.suggestions.length > 0 ? ` \u2014 did you mean ${resolved.suggestions.join(", ")}?` : "";
      fail5(`Unknown view "${options.view}"${hint}`);
      return;
    }
    selection = options.freeze ? { artifacts: resolved.artifacts } : { view: options.view };
  } else if (options.artifacts !== void 0) {
    const parsed = parseArtifacts(options.artifacts);
    if (parsed.kind === "error") {
      fail5(parsed.message);
      return;
    }
    selection = { artifacts: parsed.ids };
  } else {
    const current = readSelection(targetDir);
    if (current.kind === "error") {
      fail5(current.message);
      return;
    }
    selection = current.selection.viewName !== void 0 && !options.freeze ? { view: current.selection.viewName } : { artifacts: current.selection.artifacts };
  }
  const local = options.local ?? false;
  writeDashboardFile(targetDir, name, selection, { local });
  if (local) ensureLocalGitignore(targetDir);
  const where = `dashboards/${name}${local ? ".local" : ""}.json`;
  const kind = "view" in selection ? `live preset "${selection.view}"` : "frozen list";
  process.stdout.write(`Saved dashboard "${name}" (${kind}) to ${where}.
`);
  process.exitCode = 0;
}
function runLoad(name, path) {
  const targetDir = resolvePath2(path);
  const read = readDashboardFile(targetDir, name);
  if (read.kind === "not-found") {
    failUnknownDashboard(targetDir, name);
    return;
  }
  if (read.kind === "invalid") {
    fail5(`Dashboard "${name}" is invalid: ${read.message}`);
    return;
  }
  writeProjectConfig(targetDir, {
    dashboard_default: name,
    dashboard_view: void 0,
    dashboard_artifacts: void 0
  });
  process.stdout.write(`Default dashboard set to "${name}".
`);
  process.exitCode = 0;
}
function runLs(path) {
  const targetDir = resolvePath2(path);
  const entries = listDashboards(targetDir);
  if (entries.length === 0) {
    process.stdout.write("No saved dashboards in dashboards/.\n");
    process.exitCode = 0;
    return;
  }
  for (const e4 of entries) {
    const marker = e4.hasShared && e4.hasLocal ? "shared + personal" : e4.hasShared ? "shared (committed)" : "personal (local)";
    process.stdout.write(`${e4.name}  (${marker})
`);
  }
  process.exitCode = 0;
}
function runRm(name, path, options) {
  const targetDir = resolvePath2(path);
  const file = join10(
    targetDir,
    "dashboards",
    `${name}${options.local ? ".local" : ""}.json`
  );
  if (!existsSync7(file)) {
    failUnknownDashboard(targetDir, name);
    return;
  }
  unlinkSync2(file);
  process.stdout.write(`Removed dashboard "${name}".
`);
  process.exitCode = 0;
}
function runSuggest(phrase) {
  const matches = matchPhrase(phrase);
  if (matches.length === 0) {
    process.stdout.write(`No artifacts matched "${phrase}".
`);
    process.exitCode = 0;
    return;
  }
  for (const m of matches) {
    process.stdout.write(`${m.id}	${m.title}
`);
  }
  const ids = matches.map((m) => m.id).join(",");
  process.stdout.write(
    `
Save with: dashboard save <name> --artifacts ${ids}
`
  );
  process.exitCode = 0;
}
async function runSetup(path) {
  const isTTY = Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
  if (!isTTY) {
    fail5(
      "The setup wizard needs an interactive terminal. Use `ds-bridge dashboard set --view <preset>` (or --artifacts) instead."
    );
    return;
  }
  const targetDir = resolvePath2(path);
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
  ).argument("<artifact>", "artifact id to add").argument("[path]", "project directory holding .ds-bridge.json", ".").option(
    "--dashboard <name>",
    "edit a saved dashboard instead of the project view"
  ).action(
    (artifact, path, options) => {
      runEdit(path, artifact, "add", options.dashboard);
    }
  );
  dashboard.command("remove").description(
    "Remove an artifact from the view (materializes the current preset first)"
  ).argument("<artifact>", "artifact id to remove").argument("[path]", "project directory holding .ds-bridge.json", ".").option(
    "--dashboard <name>",
    "edit a saved dashboard instead of the project view"
  ).action(
    (artifact, path, options) => {
      runEdit(path, artifact, "remove", options.dashboard);
    }
  );
  dashboard.command("save").description(
    "Save a named dashboard (live preset by default; --freeze materializes)"
  ).argument("<name>", "dashboard name").argument("[path]", "project directory holding .ds-bridge.json", ".").option("--from-current", "save the project's current selection (default)").option("--view <preset>", "save a persona preset by name (kept live)").option(
    "--artifacts <ids>",
    "save an explicit comma-separated artifact list"
  ).option(
    "--freeze",
    "materialize the resolved artifact list (not a live preset)"
  ).option(
    "--local",
    "write a personal dashboards/<name>.local.json (gitignored)"
  ).action((name, path, options) => {
    runSave(name, path, options);
  });
  dashboard.command("load").description(
    "Set a saved dashboard as the project default (dashboard_default)"
  ).argument("<name>", "saved dashboard name").argument("[path]", "project directory holding .ds-bridge.json", ".").action((name, path) => {
    runLoad(name, path);
  });
  dashboard.command("ls").description("List saved dashboards with shared/personal markers").argument("[path]", "project directory holding .ds-bridge.json", ".").action((path) => {
    runLs(path);
  });
  dashboard.command("rm").description("Delete a saved dashboard").argument("<name>", "saved dashboard name").argument("[path]", "project directory holding .ds-bridge.json", ".").option(
    "--local",
    "delete the personal .local.json instead of the shared file"
  ).action((name, path, options) => {
    runRm(name, path, options);
  });
  dashboard.command("suggest").description(
    "Suggest artifact ids for a free-text phrase (offline NL match, no LLM)"
  ).argument("<phrase>", "free-text description of the dashboard you want").action((phrase) => {
    runSuggest(phrase);
  });
  dashboard.command("setup").description("Interactive wizard to compose and persist a dashboard view").argument("[path]", "project directory holding .ds-bridge.json", ".").action((path) => {
    void runSetup(path);
  });
}

// src/cli-commands/digest.ts
import {
  existsSync as existsSync8,
  mkdirSync as mkdirSync6,
  readFileSync as readFileSync10,
  statSync as statSync4,
  writeFileSync as writeFileSync4
} from "fs";
import { dirname as dirname3, join as join11, resolve as resolve7 } from "path";
import { cwd as processCwd2 } from "process";

// src/engines/report/history-lines.ts
function asObject(value2) {
  return typeof value2 === "object" && value2 !== null ? value2 : void 0;
}
function replayHistory(text) {
  const records = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (trimmed === "") continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const record = asObject(parsed);
    if (record === void 0) continue;
    if (typeof record.kind !== "string") continue;
    const entry = { kind: record.kind, record };
    if (typeof record.at === "string") entry.at = record.at;
    records.push(entry);
  }
  return records;
}

// src/engines/report/digest.ts
var ACCEPTED_SINCE_FORMS = 'Expected an ISO date "YYYY-MM-DD" or a relative window "<N>d" / "<N>w".';
var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
var RELATIVE = /^(\d+)([dw])$/;
var MS_PER_DAY = 24 * 60 * 60 * 1e3;
function parseSince(raw, nowIso) {
  const value2 = raw ?? "7d";
  const isoMatch = ISO_DATE.exec(value2);
  if (isoMatch !== null) {
    const ms = Date.parse(`${value2}T00:00:00.000Z`);
    if (Number.isNaN(ms)) {
      return { kind: "error", message: ACCEPTED_SINCE_FORMS };
    }
    const roundTrip = new Date(ms).toISOString().slice(0, 10);
    if (roundTrip !== value2) {
      return { kind: "error", message: ACCEPTED_SINCE_FORMS };
    }
    return { kind: "ok", sinceIso: `${value2}T00:00:00.000Z` };
  }
  const relMatch = RELATIVE.exec(value2);
  if (relMatch !== null) {
    const count = Number.parseInt(relMatch[1] ?? "", 10);
    const unit = relMatch[2];
    if (count <= 0) return { kind: "error", message: ACCEPTED_SINCE_FORMS };
    const days = unit === "w" ? count * 7 : count;
    const nowMs = Date.parse(nowIso);
    if (Number.isNaN(nowMs)) {
      return { kind: "error", message: ACCEPTED_SINCE_FORMS };
    }
    return {
      kind: "ok",
      sinceIso: new Date(nowMs - days * MS_PER_DAY).toISOString()
    };
  }
  return { kind: "error", message: ACCEPTED_SINCE_FORMS };
}
var KIND_AUDIENCE = {
  drift: "both",
  lint: "developer",
  "on-system": "both",
  coverage: "both",
  readiness: "designer",
  a11y: "designer"
};
var MOVEMENT_ORDER = [
  "drift",
  "lint",
  "on-system",
  "coverage",
  "readiness",
  "a11y"
];
function asNumber2(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function asRecord(value2) {
  return typeof value2 === "object" && value2 !== null ? value2 : void 0;
}
function pct(part, whole) {
  if (whole <= 0) return void 0;
  return Math.round(100 * part / whole);
}
function inAudience(tag, wanted) {
  if (wanted === "both") return true;
  return tag === wanted || tag === "both";
}
function absorb(side, kind, record) {
  switch (kind) {
    case "tokens-check":
      side.tokensCheck = record;
      break;
    case "lint":
      side.lint = record;
      if (asRecord(record.adoption) !== void 0) side.adoption = record;
      break;
    case "adoption":
      side.adoptionLine = record;
      break;
    case "handoff":
      side.handoff = record;
      break;
    case "a11y":
      side.a11y = record;
      break;
    default:
      break;
  }
}
function driftMetric(r2) {
  return r2 === void 0 ? void 0 : asNumber2(r2.stale);
}
function lintMetric(r2) {
  if (r2 === void 0) return void 0;
  const byKind = asRecord(r2.byKind) ?? {};
  return asNumber2(byKind.exact) + asNumber2(byKind.near) + asNumber2(byKind.offSystem);
}
function onSystemMetric(r2) {
  const adoption = r2 === void 0 ? void 0 : asRecord(r2.adoption);
  if (adoption === void 0) return void 0;
  return pct(
    asNumber2(adoption.refs),
    asNumber2(adoption.refs) + asNumber2(adoption.literals)
  );
}
function coverageMetric(r2) {
  if (r2 === void 0) return void 0;
  return pct(asNumber2(r2.imported), asNumber2(r2.total));
}
function readinessMetric(r2) {
  return r2 === void 0 ? void 0 : asNumber2(r2.score);
}
function a11yMetric(r2) {
  if (r2 === void 0) return void 0;
  const modes2 = Array.isArray(r2.modes) ? r2.modes : [];
  let passed = 0;
  let failed = 0;
  for (const m of modes2) {
    const mm = asRecord(m);
    if (mm === void 0) continue;
    passed += asNumber2(mm.passed);
    failed += asNumber2(mm.failed);
  }
  return pct(passed, passed + failed);
}
var METRICS = {
  drift: { slot: "tokensCheck", read: driftMetric },
  lint: { slot: "lint", read: lintMetric },
  "on-system": { slot: "adoption", read: onSystemMetric },
  coverage: { slot: "adoptionLine", read: coverageMetric },
  readiness: { slot: "handoff", read: readinessMetric },
  a11y: { slot: "a11y", read: a11yMetric }
};
function directionOf(baseline, current) {
  if (baseline === void 0) return "flat";
  if (current > baseline) return "up";
  if (current < baseline) return "down";
  return "flat";
}
function buildDigest(text, sinceIso, audience, readinessThreshold) {
  const records = replayHistory(text);
  const before = {};
  const inWindow = {};
  let anyInWindow = false;
  for (const { kind, at, record } of records) {
    if (at === void 0) continue;
    if (at >= sinceIso) {
      absorb(inWindow, kind, record);
      anyInWindow = true;
    } else {
      absorb(before, kind, record);
    }
  }
  if (!anyInWindow) {
    return { kind: "quiet", sinceIso, audience };
  }
  const movements = [];
  for (const kind of MOVEMENT_ORDER) {
    const tag = KIND_AUDIENCE[kind];
    if (!inAudience(tag, audience)) continue;
    const { slot, read } = METRICS[kind];
    const current = read(inWindow[slot]);
    if (current === void 0) continue;
    const baseline = read(before[slot]);
    movements.push({
      kind,
      audience: tag,
      ...baseline !== void 0 ? { baseline } : {},
      current,
      isNew: baseline === void 0,
      direction: directionOf(baseline, current)
    });
  }
  const candidates = [];
  const driftStale = driftMetric(inWindow.tokensCheck);
  if (driftStale !== void 0 && driftStale > 0) {
    candidates.push({ command: "/ds-bridge:token-check", audience: "both" });
  }
  const offSystem = inWindow.lint === void 0 ? void 0 : asNumber2(asRecord(inWindow.lint.byKind)?.offSystem);
  if (offSystem !== void 0 && offSystem > 0) {
    candidates.push({
      command: "/ds-bridge:ds-lint --fix",
      audience: "developer"
    });
  }
  const readiness = readinessMetric(inWindow.handoff);
  if (readiness !== void 0 && readiness < readinessThreshold) {
    candidates.push({ command: "/ds-bridge:handoff-qa", audience: "designer" });
  }
  const a11yFailing = (() => {
    if (inWindow.a11y === void 0) return false;
    const modes2 = Array.isArray(inWindow.a11y.modes) ? inWindow.a11y.modes : [];
    return modes2.some((m) => asNumber2(asRecord(m)?.failed) > 0);
  })();
  if (a11yFailing) {
    candidates.push({ command: "/ds-bridge:a11y-check", audience: "designer" });
  }
  const coverage = coverageMetric(inWindow.adoptionLine);
  if (coverage !== void 0 && coverage < 100) {
    candidates.push({ command: "ds-bridge adoption", audience: "both" });
  }
  const actions = candidates.filter((a) => inAudience(a.audience, audience)).slice(0, 3);
  return { kind: "ok", sinceIso, audience, movements, actions };
}

// src/engines/report/digest-md.ts
var TITLE = "# Design-system digest";
var SECTIONS2 = [
  { heading: "## For designers", audience: "designer" },
  { heading: "## For developers", audience: "developer" }
];
var MOVEMENT_LABEL = {
  drift: "Drift",
  lint: "Lint violations",
  "on-system": "On-system",
  coverage: "Import coverage",
  readiness: "Readiness",
  a11y: "Contrast"
};
var PERCENT_KINDS = /* @__PURE__ */ new Set([
  "on-system",
  "coverage",
  "a11y"
]);
var ACTION_REASON = {
  "/ds-bridge:token-check": "review breaking token drift",
  "/ds-bridge:ds-lint --fix": "clear off-system lint violations",
  "/ds-bridge:handoff-qa": "readiness is below the gate",
  "/ds-bridge:a11y-check": "failing contrast pairs need a look",
  "ds-bridge adoption": "import coverage is below 100%"
};
function arrow(row) {
  if (row.isNew) return "\u2014";
  switch (row.direction) {
    case "up":
      return "\u25B2";
    case "down":
      return "\u25BC";
    case "flat":
      return "=";
  }
}
function value(kind, n) {
  return PERCENT_KINDS.has(kind) ? `${n}%` : `${n}`;
}
function inSection2(rowAudience, sectionAudience) {
  return rowAudience === sectionAudience || rowAudience === "both";
}
function renderMovement(row) {
  const label = MOVEMENT_LABEL[row.kind];
  const current = value(row.kind, row.current);
  if (row.isNew) {
    return `- ${label} ${arrow(row)} new ${current}`;
  }
  const baseline = value(row.kind, row.baseline ?? 0);
  return `- ${label} ${arrow(row)} ${baseline} \u2192 ${current}`;
}
function renderSection2(heading, sectionAudience, movements) {
  const lines = movements.filter((m) => inSection2(m.audience, sectionAudience));
  if (lines.length === 0) return void 0;
  return [heading, "", ...lines.map(renderMovement)].join("\n");
}
function renderAction(command, index) {
  const reason = ACTION_REASON[command] ?? "see the docs";
  return `${index + 1}. Run \`${command}\` \u2014 ${reason}`;
}
function renderDigestMarkdown(model) {
  if (model.kind === "quiet") {
    return `${TITLE}

_Quiet week \u2014 no design-system movement since ${model.sinceIso}._
`;
  }
  const blocks = [
    TITLE,
    `_Window: changes since ${model.sinceIso}._`
  ];
  for (const section of SECTIONS2) {
    if (model.audience !== "both" && model.audience !== section.audience) {
      continue;
    }
    const block = renderSection2(
      section.heading,
      section.audience,
      model.movements
    );
    if (block !== void 0) blocks.push(block);
  }
  if (model.actions.length > 0) {
    const actionLines = model.actions.map((a, i) => renderAction(a.command, i));
    blocks.push(["## Actions", "", ...actionLines].join("\n"));
  }
  return `${blocks.join("\n\n")}
`;
}

// src/cli-commands/digest.ts
function defaultDeps2() {
  return {
    cwd: processCwd2(),
    now: () => /* @__PURE__ */ new Date(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  };
}
function parseAudience2(flag) {
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
function readHistoryText(stateDir) {
  try {
    return readFileSync10(join11(stateDir, "history.jsonl"), "utf8");
  } catch {
    return "";
  }
}
function resolveReadinessThreshold(targetDir) {
  const configPath = join11(targetDir, ".ds-bridge.json");
  let projectFileText;
  if (existsSync8(configPath)) {
    try {
      projectFileText = readFileSync10(configPath, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        kind: "error",
        message: `Could not read ${configPath}: ${detail}`
      };
    }
  }
  const resolved = resolveConfig(
    projectFileText !== void 0 ? { projectFileText } : {}
  );
  if (resolved.kind === "invalid-project-file") {
    return { kind: "error", message: resolved.message };
  }
  return { kind: "ok", value: resolved.config.readinessThreshold };
}
function runDigest(path, options, deps) {
  const audience = parseAudience2(options.audience);
  if (audience.kind !== "ok") {
    deps.stderr(
      `Unknown --audience "${options.audience}". Expected "designers", "developers", or "both".
`
    );
    process.exitCode = 2;
    return;
  }
  const nowIso = deps.now().toISOString();
  const since = parseSince(options.since, nowIso);
  if (since.kind !== "ok") {
    deps.stderr(`Invalid --since "${options.since}". ${since.message}
`);
    process.exitCode = 2;
    return;
  }
  const targetDir = resolve7(deps.cwd, path);
  if (!existsSync8(targetDir) || !statSync4(targetDir).isDirectory()) {
    deps.stderr(`Path "${targetDir}" is not a directory.
`);
    process.exitCode = 2;
    return;
  }
  const threshold = resolveReadinessThreshold(targetDir);
  if (threshold.kind === "error") {
    deps.stderr(`${threshold.message}
`);
    process.exitCode = 2;
    return;
  }
  const stateDir = join11(targetDir, ".ds-bridge");
  const text = readHistoryText(stateDir);
  const model = buildDigest(
    text,
    since.sinceIso,
    audience.value,
    threshold.value
  );
  const markdown = renderDigestMarkdown(model);
  if (options.out !== void 0) {
    const outPath = resolve7(deps.cwd, options.out);
    try {
      mkdirSync6(dirname3(outPath), { recursive: true });
      writeFileSync4(outPath, markdown, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      deps.stderr(`Could not write digest to "${outPath}": ${detail}
`);
      process.exitCode = 2;
      return;
    }
    deps.stdout(`${outPath}
`);
  } else {
    deps.stdout(markdown);
  }
  process.exitCode = 0;
}
function registerDigestCommand(program2) {
  program2.command("digest").description(
    "Paste-anywhere markdown of what moved in a window, segmented by audience, ending in up to three concrete actions"
  ).argument("[path]", "project directory to digest", ".").option(
    "--since <window>",
    'window start: an ISO date "YYYY-MM-DD" or a relative "<N>d" / "<N>w" (default 7d)'
  ).option("--audience <who>", "designers | developers | both", "both").option(
    "--out <file>",
    "redirect the digest markdown to a file (and print the path) instead of stdout"
  ).action((path, options) => {
    runDigest(path, options, defaultDeps2());
  });
}

// src/cli-commands/docs.ts
import {
  existsSync as existsSync9,
  mkdirSync as mkdirSync7,
  readFileSync as readFileSync11,
  statSync as statSync5,
  writeFileSync as writeFileSync5
} from "fs";
import { dirname as dirname4, join as join12, resolve as resolvePath3 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/engines/docs/merge.ts
function byNameAsc2(a, b) {
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
  docs.sort((a, b) => byNameAsc2(a.name, b.name));
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
    const values = (doc.code.variants[axis] ?? []).map((value2) => `\`${value2}\``).join(", ");
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
function fail6(message) {
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
    const filename = fileURLToPath2(import.meta.url);
    globals.__filename = filename;
    globals.__dirname = dirname4(filename);
  }
  const { scanCodeComponents } = await import("./scan-code-XUHRU37J.mjs");
  return scanCodeComponents(targetDir);
}
function loadRegistry2(targetDir) {
  const registryPath = join12(targetDir, ".ds-bridge", "registry.json");
  if (!existsSync9(registryPath)) {
    fail6(
      `No registry found at "${registryPath}". Run "ds-bridge registry build" first.`
    );
    return void 0;
  }
  let raw;
  try {
    raw = readFileSync11(registryPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail6(`Could not read registry "${registryPath}": ${detail}`);
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail6(`Registry "${registryPath}" is not valid JSON: ${detail}`);
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
    raw = readFileSync11(source.path, "utf8");
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
  return existsSync9(
    join12(resolvePath3(candidate), ".ds-bridge", "registry.json")
  );
}
function disambiguate(component, path) {
  if (component !== void 0 && component !== "" && path === "." && !hasRegistry(".") && hasRegistry(component)) {
    return { component: void 0, path: component };
  }
  return { component, path };
}
function renderTerm5(result) {
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
    fail6(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const { component, path } = disambiguate(rawComponent, rawPath);
  const targetDir = resolvePath3(path);
  if (!existsSync9(targetDir) || !statSync5(targetDir).isDirectory()) {
    fail6(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const registry = loadRegistry2(targetDir);
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
      fail6(
        `No component named "${component}" in the registry. Candidates: ${candidates.length > 0 ? candidates : "(none)"}.`
      );
      return;
    }
  }
  const outDir = options.out !== void 0 ? resolvePath3(options.out) : join12(targetDir, ".ds-bridge", "docs");
  try {
    mkdirSync7(outDir, { recursive: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail6(`Could not create output directory "${outDir}": ${detail}`);
    return;
  }
  const pages = [];
  for (const doc of docs) {
    const fileName = mdxFileName(doc.name);
    const pagePath = join12(outDir, fileName);
    try {
      writeFileSync5(pagePath, renderComponentMdx(doc), "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      fail6(`Could not write "${pagePath}": ${detail}`);
      return;
    }
    pages.push({ component: doc.name, path: pagePath, gaps: doc.gaps });
  }
  const llmsPath = join12(outDir, "llms.txt");
  try {
    writeFileSync5(llmsPath, renderLlmsTxt(docs, tokens), "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail6(`Could not write "${llmsPath}": ${detail}`);
    return;
  }
  const result = { outDir, llmsPath, pages };
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
  } else {
    process.stdout.write(`${renderTerm5(result)}
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

// src/cli-commands/frame-impl.ts
import {
  appendFileSync as appendFileSync5,
  existsSync as existsSync10,
  mkdirSync as mkdirSync8,
  readdirSync as readdirSync2,
  readFileSync as readFileSync12
} from "fs";
import { isAbsolute as isAbsolute2, join as join13, resolve as resolve8, sep as sep2 } from "path";
import { cwd } from "process";

// src/engines/handoff/parse-url.ts
var KEY_PATH_TYPES = /* @__PURE__ */ new Set(["file", "design", "proto"]);
function isFigmaHost(host) {
  const lower = host.toLowerCase();
  return lower === "figma.com" || lower.endsWith(".figma.com");
}
function normalizeNodeId(raw) {
  let value2 = raw;
  try {
    value2 = decodeURIComponent(raw);
  } catch {
    value2 = raw;
  }
  if (value2.length === 0) return void 0;
  return value2.replace(/-/g, ":");
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
  const segments2 = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments2.length === 0) {
    return INVALID("Figma URL is missing a file key.");
  }
  const [pathType, ...rest] = segments2;
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

// src/engines/tokens/token-index.ts
function canonicalValueKey(token) {
  const { value: value2 } = token;
  if (typeof value2 === "number") {
    const dim2 = normalizeDimension(value2);
    return token.type === "dimension" && dim2 !== void 0 ? `${dim2.px}px` : String(value2);
  }
  if (typeof value2 !== "string") return void 0;
  const color = normalizeColor(value2);
  if (color !== void 0) return color;
  const dim = normalizeDimension(value2);
  if (dim !== void 0) return `${dim.px}px`;
  return value2;
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

// src/engines/registry/persist.ts
function round3(value2) {
  if (!Number.isFinite(value2)) return 0;
  return Math.round(value2 * 1e3) / 1e3;
}
function normalizeName2(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function byNameAsc3(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function toRegistryFile(result, generatedAt) {
  const matches = result.matches.map((m) => ({
    codeName: m.code.name,
    importPath: m.code.importPath,
    figmaName: m.figma.name,
    nodeId: m.figma.nodeId,
    score: round3(m.score)
  })).sort((a, b) => byNameAsc3(a.codeName, b.codeName));
  const unmatchedCode = result.unmatchedCode.map((u) => ({
    name: u.code.name,
    importPath: u.code.importPath,
    candidates: u.candidates.map((c2) => ({
      figmaName: c2.figma.name,
      nodeId: c2.figma.nodeId,
      score: round3(c2.score)
    }))
  })).sort((a, b) => byNameAsc3(a.name, b.name));
  const unmatchedFigma = result.unmatchedFigma.map((u) => ({
    name: u.figma.name,
    nodeId: u.figma.nodeId,
    candidates: u.candidates.map((c2) => ({
      codeName: c2.code.name,
      score: round3(c2.score)
    }))
  })).sort((a, b) => byNameAsc3(a.name, b.name));
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
  const normalizedQuery = normalizeName2(query);
  for (const entry of registry.matches) {
    if (entry.nodeId === query) return { kind: "match", entry };
  }
  for (const entry of registry.matches) {
    if (entry.figmaName === query) return { kind: "match", entry };
  }
  if (normalizedQuery.length > 0) {
    for (const entry of registry.matches) {
      if (normalizeName2(entry.figmaName) === normalizedQuery) {
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
      if (normalizeName2(entry.name) === normalizedQuery) {
        return { kind: "candidates", entries: entry.candidates };
      }
    }
  }
  return { kind: "not-found" };
}

// src/engines/registry/gaps.ts
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
function resolveComponent(requirement, registry) {
  const byId = resolveEntry(registry, requirement.nodeId);
  const outcome = byId.kind === "not-found" ? resolveEntry(registry, requirement.name) : byId;
  if (outcome.kind === "match") {
    return {
      requirement,
      resolution: {
        kind: "registry-match",
        codeName: outcome.entry.codeName,
        importPath: outcome.entry.importPath
      }
    };
  }
  if (outcome.kind === "candidates") {
    const candidates = outcome.entries.map((c2) => c2.codeName);
    const list = candidates.length > 0 ? ` (${candidates.join(", ")})` : "";
    return {
      requirement,
      reason: "ambiguous-registry-match",
      candidates,
      suggestion: `Multiple code components could match "${requirement.name}"${list} \u2014 pick one with a designer/engineer, don't guess.`
    };
  }
  return {
    requirement,
    reason: "no-registry-match",
    candidates: [],
    suggestion: `No code component matches "${requirement.name}" \u2014 build it or publish the Figma component, then rebuild the registry. Do not invent UI.`
  };
}
function resolveColor(requirement, index) {
  const canonical2 = normalizeColor(requirement.rawValue);
  if (canonical2 === void 0) return noTokenMatch(requirement);
  const exact = index.byValue.get(canonical2);
  const preferred = pickPreferred(exact ?? []);
  if (preferred !== void 0) {
    return tokenExact(requirement, preferred.name);
  }
  const near = index.nearest(canonical2, {
    maxDeltaE: COLOR_NEAR_DELTA_E,
    limit: NEAR_LIMIT
  });
  if (near.length > 0) {
    return nearTokenOnly(
      requirement,
      near.map((m) => m.token.name)
    );
  }
  return noTokenMatch(requirement);
}
function resolveDimension(requirement, index) {
  const dim = normalizeDimension(requirement.rawValue);
  if (dim === void 0) return noTokenMatch(requirement);
  const bucket = index.byValue.get(`${dim.px}px`);
  const exact = bucket?.find((t) => t.type === "dimension");
  if (exact !== void 0) return tokenExact(requirement, exact.name);
  const near = [];
  for (const token of index.byName.values()) {
    if (token.type !== "dimension") continue;
    const tokenDim = normalizeDimension(
      typeof token.value === "number" || typeof token.value === "string" ? token.value : Number.NaN
    );
    if (tokenDim === void 0) continue;
    const distance = Math.abs(dim.px - tokenDim.px);
    if (distance === 0 || distance > DIMENSION_NEAR_PX) continue;
    near.push({ name: token.name, distance });
  }
  if (near.length === 0) return noTokenMatch(requirement);
  near.sort(
    (a, b) => a.distance !== b.distance ? a.distance - b.distance : a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  return nearTokenOnly(
    requirement,
    near.slice(0, NEAR_LIMIT).map((n) => n.name)
  );
}
function tokenExact(requirement, tokenName) {
  return { requirement, resolution: { kind: "token-exact", tokenName } };
}
function nearTokenOnly(requirement, candidates) {
  const nearest = candidates[0] ?? "";
  return {
    requirement,
    reason: "near-token-only",
    candidates,
    suggestion: `No exact token for "${requirement.rawValue}" \u2014 nearest is ${nearest}; use it only with designer sign-off, otherwise add a token.`
  };
}
function noTokenMatch(requirement) {
  return {
    requirement,
    reason: "no-token-match",
    candidates: [],
    suggestion: `No token matches "${requirement.rawValue}" \u2014 add a token for it; never approximate with a raw value.`
  };
}
function isResolved(outcome) {
  return "resolution" in outcome;
}
function findGaps(input) {
  const index = buildTokenIndex(input.tokens);
  const resolved = [];
  const gaps = [];
  for (const requirement of input.requirements) {
    const outcome = requirement.kind === "component" ? resolveComponent(requirement, input.registry) : requirement.valueKind === "color" ? resolveColor(requirement, index) : resolveDimension(requirement, index);
    if (isResolved(outcome)) {
      resolved.push(outcome);
    } else {
      gaps.push(outcome);
    }
  }
  return { resolved, gaps };
}

// src/io/figma/file-key.ts
function editDistance4(a, b) {
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
function suggestAliases(input, aliases, limit = 3) {
  const needle = input.toLowerCase();
  const MAX_DISTANCE = 4;
  return aliases.map((alias, index) => ({
    alias,
    index,
    prefix: alias.toLowerCase().startsWith(needle),
    distance: editDistance4(needle, alias.toLowerCase())
  })).filter((c2) => c2.prefix || c2.distance <= MAX_DISTANCE).sort(
    (a, b) => Number(b.prefix) - Number(a.prefix) || a.distance - b.distance || a.index - b.index
  ).slice(0, limit).map((c2) => c2.alias);
}
var FIGMA_KEY_MIN_LENGTH = 22;
function looksLikeFigmaKey(value2) {
  return value2.length >= FIGMA_KEY_MIN_LENGTH && /^[A-Za-z0-9]+$/.test(value2);
}
function resolveFileKey(input) {
  const { flagValue, productFileKeys, defaultKey } = input;
  if (flagValue === void 0 || flagValue === "") {
    if (defaultKey !== void 0 && defaultKey !== "") {
      return { kind: "ok", key: defaultKey };
    }
    return { kind: "missing" };
  }
  const mapped = Object.hasOwn(productFileKeys, flagValue) ? productFileKeys[flagValue] : void 0;
  if (mapped !== void 0) {
    return { kind: "ok", key: mapped };
  }
  const aliases = Object.keys(productFileKeys);
  if (aliases.length === 0 || looksLikeFigmaKey(flagValue)) {
    return { kind: "ok", key: flagValue };
  }
  return {
    kind: "unknown-alias",
    alias: flagValue,
    suggestions: suggestAliases(flagValue, aliases)
  };
}

// src/cli-commands/frame-impl.ts
var DEFAULT_FIGMA_API_BASE2 = "https://api.figma.com";
var TOP_GAPS_LIMIT = 5;
var PARSERS3 = {
  w3c: parseW3c,
  "tokens-studio": parseTokensStudio,
  "style-dictionary": parseStyleDictionary
};
var EXCLUDED_DIRS2 = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build"]);
function fail7(message) {
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
    "The token needs the file_content:read scope, and must come from a Dev or",
    "Full seat \u2014 a View seat is rate-limited and cannot be used here."
  ].join("\n");
}
function unknownAliasMessage(outcome, productFileKeys) {
  const aliases = Object.keys(productFileKeys);
  const lines = [`Unknown --file-key alias "${outcome.alias}".`];
  if (outcome.suggestions.length > 0) {
    lines.push(`Did you mean ${outcome.suggestions.join(", ")}?`);
  }
  lines.push(
    "",
    aliases.length > 0 ? `Available product_file_keys aliases: ${aliases.join(", ")}.` : "No product_file_keys aliases are configured.",
    "Or pass --file-key <raw-figma-file-key> directly."
  );
  return lines.join("\n");
}
function missingRegistryMessage(registryPath) {
  return [
    `No component registry found at ${registryPath}.`,
    "",
    'Run "ds-bridge registry build" first \u2014 it maps the Figma library to your',
    "code components, which frame-impl needs to resolve component requirements."
  ].join("\n");
}
function clientErrorMessage(result) {
  switch (result.kind) {
    case "auth-error":
      return "Figma rejected the token (auth error). Check that FIGMA_TOKEN is a valid Dev/Full-seat personal access token.";
    case "scope-error":
      return `Figma token is missing a required scope: ${result.message}. The token needs file_content:read.`;
    case "not-found":
      return "Figma could not find that file or node. Check the frame URL is correct and the token's account can access the file.";
    case "rate-limited":
      return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited \u2014 use a Dev/Full-seat PAT.`;
    case "network-error":
      return `Could not reach the Figma API: ${result.message}.`;
  }
}
function readProjectConfigText2() {
  const configPath = join13(cwd(), ".ds-bridge.json");
  if (!existsSync10(configPath)) return void 0;
  try {
    return readFileSync12(configPath, "utf8");
  } catch {
    return void 0;
  }
}
function loadRegistry3(registryPath) {
  if (!existsSync10(registryPath)) {
    return { kind: "error", message: missingRegistryMessage(registryPath) };
  }
  try {
    const registry = JSON.parse(
      readFileSync12(registryPath, "utf8")
    );
    return { kind: "ok", registry };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      message: `Could not read the registry at ${registryPath}: ${detail}. Re-run "ds-bridge registry build".`
    };
  }
}
function isConventionalTokenFile2(name) {
  if (!name.endsWith(".json")) return false;
  return name === "tokens.json" || name === "design-tokens.json" || name.endsWith(".tokens.json");
}
function isTokenDir2(name) {
  return name === "tokens" || name === "design-tokens";
}
function detectFileFormat2(absPath) {
  let raw;
  try {
    raw = readFileSync12(absPath, "utf8");
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
function depthOf2(path) {
  return path.split(sep2).filter((s) => s.length > 0).length;
}
function collectTokenCandidates(dir, insideTokenDir, acc) {
  let entries;
  try {
    entries = readdirSync2(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join13(dir, entry.name);
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
function discoverFirstTokenSource(root) {
  const candidates = [];
  collectTokenCandidates(root, false, candidates);
  const verified = candidates.filter((path) => detectFileFormat2(path) !== void 0).sort((a, b) => {
    const depth = depthOf2(a) - depthOf2(b);
    return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
  });
  return verified[0];
}
function loadTokens(targetDir) {
  let tokenPath;
  const configPath = join13(targetDir, ".ds-bridge.json");
  if (existsSync10(configPath)) {
    try {
      const resolved = resolveConfig({
        projectFileText: readFileSync12(configPath, "utf8")
      });
      if (resolved.kind === "ok" && resolved.config.tokenSource !== void 0) {
        const src = resolved.config.tokenSource;
        tokenPath = isAbsolute2(src) ? src : resolve8(targetDir, src);
      }
    } catch {
      tokenPath = void 0;
    }
  }
  if (tokenPath === void 0) {
    tokenPath = discoverFirstTokenSource(targetDir);
  }
  if (tokenPath === void 0 || !existsSync10(tokenPath)) {
    return {
      kind: "error",
      message: `No design-token source found for "${targetDir}".
Set token_source in .ds-bridge.json, or add a conventional token file (tokens.json, design-tokens.json, *.tokens.json).`
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync12(tokenPath, "utf8"));
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
    return {
      kind: "error",
      message: `Failed to parse token source "${tokenPath}" as ${format}.`
    };
  }
  return { kind: "ok", tokens: outcome.map.tokens };
}
function collectNodes(root) {
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
function hasBoundFill(node) {
  const fills = node.boundVariables?.fills;
  return Array.isArray(fills) && fills.length > 0;
}
function firstSolidFillColor(node) {
  if (!Array.isArray(node.fills)) return void 0;
  for (const paint of node.fills) {
    if (paint.type !== "SOLID" || paint.color === void 0) continue;
    const { r: r2, g, b, a } = paint.color;
    const to255 = (v) => Math.round(v * 255);
    return a >= 1 ? `rgb(${to255(r2)}, ${to255(g)}, ${to255(b)})` : `rgba(${to255(r2)}, ${to255(g)}, ${to255(b)}, ${a})`;
  }
  return void 0;
}
function deriveRequirements(root) {
  const requirements = [];
  for (const node of collectNodes(root)) {
    if (node.type === "INSTANCE") {
      requirements.push({
        kind: "component",
        nodeId: node.id,
        name: node.name
      });
      continue;
    }
    if (!hasBoundFill(node)) {
      const rawValue = firstSolidFillColor(node);
      if (rawValue !== void 0) {
        requirements.push({
          kind: "token",
          property: "fill",
          rawValue,
          valueKind: "color"
        });
      }
    }
  }
  return requirements;
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
function requirementLabel(requirement) {
  return requirement.kind === "component" ? requirement.name : `${requirement.property}: ${requirement.rawValue}`;
}
function rollUp(report, frameName) {
  const resolvedCount = report.resolved.length;
  const gapCount = report.gaps.length;
  const total = resolvedCount + gapCount;
  const pct5 = total === 0 ? 0 : Math.round(100 * resolvedCount / total);
  const byReason = {};
  for (const gap of report.gaps) {
    byReason[gap.reason] = (byReason[gap.reason] ?? 0) + 1;
  }
  const topGaps = report.gaps.slice(0, TOP_GAPS_LIMIT).map((gap) => ({
    reason: gap.reason,
    requirement: requirementLabel(gap.requirement)
  }));
  return { frameName, resolvedCount, gapCount, pct: pct5, byReason, topGaps };
}
function renderTerm6(impl, color) {
  const severity = impl.pct >= 80 ? "ok" : impl.pct >= 50 ? "warn" : "error";
  const headline = severityColor(
    severity,
    `Frame "${impl.frameName}" is ${impl.pct}% implementable (${impl.resolvedCount} resolved / ${impl.resolvedCount + impl.gapCount} requirements).`,
    { color }
  );
  const lines = [headline];
  if (impl.gapCount === 0) {
    lines.push("", "No gaps \u2014 every requirement resolves to the system.");
    return lines.join("\n");
  }
  const rows = Object.entries(impl.byReason).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([reason, count]) => [reason, String(count)]);
  lines.push(
    "",
    `${impl.gapCount} gap(s) by reason:`,
    renderTable(["reason", "count"], rows, { color })
  );
  return lines.join("\n");
}
function appendFrameImplHistory(record) {
  const stateDir = join13(cwd(), ".ds-bridge");
  mkdirSync8(stateDir, { recursive: true });
  appendFileSync5(
    join13(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
async function runFrameImpl(url, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail7(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const parsed = parseFigmaUrl(url);
  if (parsed.kind !== "ok") {
    fail7(
      `${parsed.message}
Expected a Figma frame URL like https://www.figma.com/design/<key>/<name>?node-id=1-2`
    );
    return;
  }
  const projectFileText = readProjectConfigText2();
  const resolved = resolveConfig({
    env: process.env,
    ...projectFileText !== void 0 ? { projectFileText } : {}
  });
  if (resolved.kind !== "ok") {
    fail7(resolved.message);
    return;
  }
  for (const warning of resolved.warnings) {
    process.stderr.write(`warning: ${warning}
`);
  }
  const { config } = resolved;
  if (config.figmaToken.kind === "missing") {
    fail7(missingTokenMessage());
    return;
  }
  const fileKeyOutcome = resolveFileKey({
    ...options.fileKey !== void 0 ? { flagValue: options.fileKey } : {},
    productFileKeys: config.productFileKeys,
    defaultKey: parsed.fileKey
  });
  if (fileKeyOutcome.kind === "unknown-alias") {
    fail7(unknownAliasMessage(fileKeyOutcome, config.productFileKeys));
    return;
  }
  if (fileKeyOutcome.kind === "missing") {
    fail7("No Figma file key resolved from the URL or --file-key.");
    return;
  }
  const fileKey = fileKeyOutcome.key;
  const targetDir = cwd();
  const registryPath = join13(targetDir, ".ds-bridge", "registry.json");
  const registryOutcome = loadRegistry3(registryPath);
  if (registryOutcome.kind === "error") {
    fail7(registryOutcome.message);
    return;
  }
  const tokensOutcome = loadTokens(targetDir);
  if (tokensOutcome.kind === "error") {
    fail7(tokensOutcome.message);
    return;
  }
  const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE2;
  const client = createFigmaClient({ token: config.figmaToken.value, baseUrl });
  const fetched = await fetchRoot(client, fileKey, parsed.nodeId);
  if (fetched.kind !== "ok") {
    fail7(fetched.message);
    return;
  }
  const requirements = deriveRequirements(fetched.root);
  const gapsReport = findGaps({
    requirements,
    registry: registryOutcome.registry,
    tokens: tokensOutcome.tokens
  });
  const impl = rollUp(gapsReport, fetched.root.name);
  if (options.history) {
    appendFrameImplHistory({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      kind: "frame-impl",
      frameName: impl.frameName,
      fileKey,
      ...parsed.nodeId !== void 0 ? { nodeId: parsed.nodeId } : {},
      resolvedCount: impl.resolvedCount,
      gapCount: impl.gapCount,
      pct: impl.pct,
      byReason: impl.byReason,
      topGaps: impl.topGaps
    });
  }
  if (format === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          frameName: impl.frameName,
          fileKey,
          ...parsed.nodeId !== void 0 ? { nodeId: parsed.nodeId } : {},
          pct: impl.pct,
          resolvedCount: impl.resolvedCount,
          gapCount: impl.gapCount,
          byReason: impl.byReason,
          topGaps: impl.topGaps
        },
        null,
        2
      )}
`
    );
  } else {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(`${renderTerm6(impl, color)}
`);
  }
  process.exitCode = 0;
}
function registerFrameImplCommand(program2) {
  program2.command("frame-impl").description(
    "Resolve a Figma frame against the system and report its implementability (% on-system)"
  ).argument("<url>", "Figma frame URL (file/design/proto, optional node-id)").option(
    "--file-key <keyOrAlias>",
    "target a product file by raw key or product_file_keys alias (default: the URL's key)"
  ).option("--format <format>", "output format: term | json", "term").option(
    "--no-history",
    "do not append a frame-impl record to .ds-bridge/history.jsonl in the current directory"
  ).action((url, options) => {
    void runFrameImpl(url, options);
  });
}

// src/cli-commands/handoff.ts
import { appendFileSync as appendFileSync6, mkdirSync as mkdirSync9 } from "fs";
import { join as join14 } from "path";
import { cwd as cwd2 } from "process";

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
var DEFAULT_FIGMA_API_BASE3 = "https://api.figma.com";
var RULE_LABEL = {
  "var-binding": "Variable binding",
  "auto-layout": "Auto layout",
  component: "Component usage",
  naming: "Naming"
};
var HISTORY_DEDUCTION_LIMIT = 3;
function appendHandoffHistory(report, frameName) {
  const stateDir = join14(cwd2(), ".ds-bridge");
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "handoff",
    score: report.score,
    frameName,
    deductions: report.deductions.slice(0, HISTORY_DEDUCTION_LIMIT).map((d) => ({ rule: d.rule, points: d.points }))
  };
  mkdirSync9(stateDir, { recursive: true });
  appendFileSync6(
    join14(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
function fail8(message) {
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
    "Create the token at figma.com \u2192 Settings \u2192 Security \u2192 Personal access",
    "tokens, with these scopes:",
    "  file_content:read, library_content:read, file_versions:read,",
    "  file_comments:read, file_comments:write",
    "",
    "Note: the PAT must come from a Dev or Full seat \u2014 a View seat is rate-",
    "limited to roughly a handful of requests per month and cannot be used here."
  ].join("\n");
}
function clientErrorMessage2(result) {
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
function renderTerm7(report, threshold, color) {
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
function nodeFromFileNodes2(nodes, nodeId) {
  const direct = nodes[nodeId];
  if (direct !== void 0) return direct.document;
  const entries = Object.values(nodes).filter(
    (v) => v !== void 0
  );
  return entries[0]?.document;
}
async function fetchRoot2(client, fileKey, nodeId) {
  if (nodeId !== void 0) {
    const result2 = await client.getFileNodes(fileKey, [nodeId]);
    if (result2.kind !== "ok") {
      return { kind: "error", message: clientErrorMessage2(result2) };
    }
    const root = nodeFromFileNodes2(result2.data.nodes, nodeId);
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
    return { kind: "error", message: clientErrorMessage2(result) };
  }
  return { kind: "ok", root: result.data.document };
}
async function runHandoff(url, options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail8(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const parsed = parseFigmaUrl(url);
  if (parsed.kind !== "ok") {
    fail8(
      `${parsed.message}
Expected a Figma frame URL like https://www.figma.com/design/<key>/<name>?node-id=1-2`
    );
    return;
  }
  const resolved = resolveConfig({ env: process.env });
  if (resolved.kind !== "ok") {
    fail8(resolved.message);
    return;
  }
  for (const warning of resolved.warnings) {
    process.stderr.write(`warning: ${warning}
`);
  }
  const { config } = resolved;
  if (config.figmaToken.kind === "missing") {
    fail8(missingTokenMessage2());
    return;
  }
  const threshold = resolveThreshold(
    options.threshold,
    config.readinessThreshold
  );
  if (threshold.kind === "error") {
    fail8(threshold.message);
    return;
  }
  const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE3;
  const client = createFigmaClient({
    token: config.figmaToken.value,
    baseUrl
  });
  const fetched = await fetchRoot2(client, parsed.fileKey, parsed.nodeId);
  if (fetched.kind !== "ok") {
    fail8(fetched.message);
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
    process.stdout.write(`${renderTerm7(report, threshold.value, color)}
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
          `warning: could not post the Figma comment: ${clientErrorMessage2(posted)}
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
  appendFileSync as appendFileSync7,
  existsSync as existsSync11,
  mkdirSync as mkdirSync10,
  readFileSync as readFileSync13,
  writeFileSync as writeFileSync6
} from "fs";
import { dirname as dirname5, join as join15 } from "path";
import { cwd as cwd3, env as processEnv } from "process";
import { fileURLToPath as fileURLToPath3 } from "url";

// src/engines/impact/component-diff.ts
var RENAME_THRESHOLD = 0.5;
function tokenize3(name) {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Za-z])([0-9])/g, "$1 $2").replace(/([0-9])([A-Za-z])/g, "$1 $2");
  const tokens = [];
  for (const part of spaced.split(/[^a-zA-Z0-9]+/)) {
    const token = part.toLowerCase();
    if (token.length > 0) tokens.push(token);
  }
  return tokens;
}
function nameSimilarity(a, b) {
  const setA = new Set(tokenize3(a));
  const setB = new Set(tokenize3(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return 2 * intersection / (setA.size + setB.size);
}
function byNameAsc4(a, b) {
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
    for (const value2 of afterSet) {
      if (!beforeSet.has(value2)) added.push(value2);
    }
    for (const value2 of beforeSet) {
      if (!afterSet.has(value2)) removed.push(value2);
    }
    for (const value2 of removed.sort()) {
      changes.push({ axis, kind: "value-removed", value: value2 });
    }
    for (const value2 of added.sort()) {
      changes.push({ axis, kind: "value-added", value: value2 });
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
  added.sort(byNameAsc4);
  removed.sort(byNameAsc4);
  renamed.sort(
    (x, y) => x.toName < y.toName ? -1 : x.toName > y.toName ? 1 : 0
  );
  changed.sort(byNameAsc4);
  return { added, removed, renamed, changed };
}

// src/engines/registry/scan-figma.ts
function isString(value2) {
  return typeof value2 === "string";
}
function asString(value2) {
  return isString(value2) ? value2 : "";
}
function parseVariantName(name) {
  const props = {};
  if (!name.includes("=")) return props;
  for (const pair of name.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    const value2 = pair.slice(eq + 1).trim();
    if (key.length === 0) continue;
    const existing = props[key];
    if (existing === void 0) {
      props[key] = [value2];
    } else {
      existing.push(value2);
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
function unknownAliasMessage2(outcome, productFileKeys) {
  const aliases = Object.keys(productFileKeys);
  const lines = [`Unknown --file-key alias "${outcome.alias}".`];
  if (outcome.suggestions.length > 0) {
    lines.push(`Did you mean ${outcome.suggestions.join(", ")}?`);
  }
  lines.push(
    "",
    aliases.length > 0 ? `Available product_file_keys aliases: ${aliases.join(", ")}.` : "No product_file_keys aliases are configured.",
    "Or pass --file-key <raw-figma-file-key> directly."
  );
  return lines.join("\n");
}
function clientErrorMessage3(result) {
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
function readProjectConfigText3() {
  const configPath = join15(cwd3(), ".ds-bridge.json");
  if (!existsSync11(configPath)) return void 0;
  try {
    return readFileSync13(configPath, "utf8");
  } catch {
    return void 0;
  }
}
function cursorPath() {
  const dataDir = processEnv.CLAUDE_PLUGIN_DATA;
  if (dataDir !== void 0 && dataDir !== "") {
    return join15(dataDir, "impact-cursor.json");
  }
  return join15(cwd3(), ".ds-bridge", "cache", "impact-cursor.json");
}
function readCursor(path) {
  if (!existsSync11(path)) return void 0;
  try {
    const parsed = JSON.parse(readFileSync13(path, "utf8"));
    if (!Array.isArray(parsed.snapshot)) return void 0;
    return parsed;
  } catch {
    return void 0;
  }
}
function writeCursor(path, cursor) {
  try {
    mkdirSync10(dirname5(path), { recursive: true });
    writeFileSync6(path, `${JSON.stringify(cursor, null, 2)}
`, "utf8");
    return true;
  } catch {
    return false;
  }
}
function loadRegistry4() {
  const registryPath = join15(cwd3(), ".ds-bridge", "registry.json");
  if (!existsSync11(registryPath)) return void 0;
  try {
    return JSON.parse(readFileSync13(registryPath, "utf8"));
  } catch {
    return void 0;
  }
}
async function mapChangedUsage(registry, changedFigmaNames) {
  const globals = globalThis;
  if (typeof globals.__filename !== "string") {
    const filename = fileURLToPath3(import.meta.url);
    globals.__filename = filename;
    globals.__dirname = dirname5(filename);
  }
  const { mapUsage } = await import("./usage-OFLQCL5F.mjs");
  return mapUsage({ registry, changedFigmaNames, projectDir: cwd3() });
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
function buildMigrationSites(diff, usageByName, cap) {
  const all = [];
  for (const row of diffRows(diff)) {
    const usage = usageByName.get(row.lookupName);
    if (usage === void 0) continue;
    for (const site of usage.usages) {
      all.push({
        file: site.file,
        line: site.line,
        subject: row.component,
        from: row.fromName,
        to: row.toName
      });
    }
  }
  const limit = Number.isFinite(cap) && cap > 0 ? cap : all.length;
  const truncated = all.length > limit;
  return { sites: truncated ? all.slice(0, limit) : all, truncated };
}
function appendImpactHistory(targetDir, diff, usageByName, cap) {
  const stateDir = join15(targetDir, ".ds-bridge");
  let touchedCallSites = 0;
  for (const usage of usageByName.values()) {
    touchedCallSites += usage.usages.length;
  }
  const { sites, truncated } = buildMigrationSites(diff, usageByName, cap);
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "impact",
    ...countByImpact(diff),
    touchedCallSites,
    ...sites.length > 0 ? { sites } : {},
    ...truncated ? { sitesTruncated: true } : {}
  };
  mkdirSync10(stateDir, { recursive: true });
  appendFileSync7(
    join15(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
function renderChecklist(sites, truncated) {
  if (sites.length === 0) {
    return "Migration checklist: no mapped call sites (no registry, or no changed component is imported in resolved .tsx files).";
  }
  const header = `Migration checklist \u2014 ${sites.length} call site${sites.length === 1 ? "" : "s"}${truncated ? " (truncated to the cap)" : ""}:`;
  const lines = sites.map((s) => {
    const move = s.from !== "" && s.to !== "" ? `${s.from} \u2192 ${s.to}` : s.to === "" ? `${s.from} \u2192 (removed)` : `(new) \u2192 ${s.to}`;
    return `  ${s.file}:${s.line} \xB7 ${s.subject} \xB7 ${move}`;
  });
  return [header, ...lines].join("\n");
}
function diffRows(diff) {
  const rows = [];
  for (const r2 of diff.removed) {
    rows.push({
      component: r2.name,
      lookupName: r2.name,
      category: "removed",
      impact: r2.impact,
      detail: "component removed from the library",
      fromName: r2.name,
      toName: ""
    });
  }
  for (const r2 of diff.renamed) {
    rows.push({
      component: r2.toName,
      lookupName: r2.fromName,
      category: "renamed",
      impact: r2.impact,
      detail: `renamed from "${r2.fromName}"`,
      fromName: r2.fromName,
      toName: r2.toName
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
      detail: parts.join(", "),
      fromName: c2.name,
      toName: c2.name
    });
  }
  for (const a of diff.added) {
    rows.push({
      component: a.name,
      lookupName: a.name,
      category: "added",
      impact: a.impact,
      detail: "new component",
      fromName: "",
      toName: a.name
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
function renderTerm8(diff, usageByName, registryPresent, color) {
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
    fail9(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const projectFileText = readProjectConfigText3();
  const resolved = resolveConfig({
    env: process.env,
    ...projectFileText !== void 0 ? { projectFileText } : {}
  });
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
  const fileKeyOutcome = resolveFileKey({
    ...options.fileKey !== void 0 ? { flagValue: options.fileKey } : {},
    productFileKeys: config.productFileKeys,
    ...config.figmaFileKey !== void 0 ? { defaultKey: config.figmaFileKey } : {}
  });
  if (fileKeyOutcome.kind === "unknown-alias") {
    fail9(unknownAliasMessage2(fileKeyOutcome, config.productFileKeys));
    return;
  }
  if (fileKeyOutcome.kind === "missing") {
    fail9(missingFileKeyMessage());
    return;
  }
  const fileKey = fileKeyOutcome.key;
  const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE4;
  const client = createFigmaClient({ token: config.figmaToken.value, baseUrl });
  const componentsResult = await client.getComponents(fileKey);
  if (componentsResult.kind !== "ok") {
    fail9(clientErrorMessage3(componentsResult));
    return;
  }
  const versionsResult = await client.getVersions(fileKey);
  if (versionsResult.kind !== "ok") {
    fail9(clientErrorMessage3(versionsResult));
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
      fail9(`Could not write the impact cursor to "${path}".`);
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
  const registry = loadRegistry4();
  const usageByName = /* @__PURE__ */ new Map();
  if (registry !== void 0) {
    const usages = await mapChangedUsage(registry, changedNames(diff));
    for (const usage of usages) usageByName.set(usage.figmaName, usage);
  }
  const { sites, truncated } = buildMigrationSites(
    diff,
    usageByName,
    config.migrationSitesCap
  );
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
          registryPresent: registry !== void 0,
          sites,
          sitesTruncated: truncated
        },
        null,
        2
      )}
`
    );
  } else {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(
      `${renderTerm8(diff, usageByName, registry !== void 0, color)}
`
    );
  }
  if (options.checklist && format === "term") {
    process.stdout.write(`
${renderChecklist(sites, truncated)}
`);
  }
  appendImpactHistory(cwd3(), diff, usageByName, config.migrationSitesCap);
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
  ).option(
    "--file-key <keyOrAlias>",
    "Figma file key OR a product_file_keys alias (overrides config)"
  ).option("--format <format>", "output format: term | json", "term").option(
    "--checklist",
    "print the per-call-site migration checklist (file:line \xB7 old\u2192new) after the report (term only)",
    false
  ).option(
    "--sites",
    "alias of --checklist: print the per-call-site migration checklist (term only)",
    false
  ).action((options) => {
    void runImpact({
      ...options,
      checklist: options.checklist || options.sites === true
    });
  });
}

// src/cli-commands/library-health.ts
import {
  appendFileSync as appendFileSync8,
  existsSync as existsSync12,
  mkdirSync as mkdirSync11,
  readFileSync as readFileSync14,
  writeFileSync as writeFileSync7
} from "fs";
import { join as join17 } from "path";
import { cwd as cwd4, env as processEnv2 } from "process";

// src/engines/figma/library-health.ts
var DEFAULT_DEPRECATED_PATTERN = /deprecat|legacy|\[old\]|do[\s-]?not[\s-]?use|⚠/i;
var CAP = 20;
function componentNameOf(file, componentId) {
  if (componentId === void 0) return void 0;
  const components = file.components;
  if (components === void 0) return void 0;
  return components[componentId]?.name;
}
function walk(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    visit(node);
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child !== void 0) stack.push(child);
      }
    }
  }
}
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function assessLibraryHealth(file, opts) {
  const deprecatedPattern = opts?.deprecatedPattern ?? DEFAULT_DEPRECATED_PATTERN;
  const hasComponents = file.components !== void 0;
  const componentNames = /* @__PURE__ */ new Set();
  if (file.components !== void 0) {
    for (const id of Object.keys(file.components)) {
      const entry = file.components[id];
      if (entry !== void 0) componentNames.add(entry.name);
    }
  }
  const hotspots = [];
  const deprecatedCounts = /* @__PURE__ */ new Map();
  const detached = [];
  walk(file.document, (node) => {
    const isInstance = node.type === "INSTANCE";
    if (isInstance) {
      const overrides = node.overrides;
      const overrideCount = Array.isArray(overrides) ? overrides.length : 0;
      if (overrideCount > 0) {
        const componentName = componentNameOf(file, node.componentId);
        hotspots.push({
          nodeId: node.id,
          name: node.name,
          ...componentName !== void 0 ? { componentName } : {},
          overrideCount
        });
      }
      if (hasComponents) {
        const componentName = componentNameOf(file, node.componentId);
        if (componentName !== void 0 && deprecatedPattern.test(componentName)) {
          deprecatedCounts.set(
            componentName,
            (deprecatedCounts.get(componentName) ?? 0) + 1
          );
        }
      }
    } else if (hasComponents && (node.type === "FRAME" || node.type === "GROUP") && componentNames.has(node.name)) {
      detached.push({ nodeId: node.id, name: node.name, heuristic: true });
    }
  });
  let deprecatedUsageTotal = 0;
  for (const count of deprecatedCounts.values()) deprecatedUsageTotal += count;
  const totals = {
    overrideHotspots: hotspots.length,
    deprecatedUsage: deprecatedUsageTotal,
    detachedCandidates: detached.length
  };
  hotspots.sort((a, b) => {
    if (a.overrideCount !== b.overrideCount) {
      return b.overrideCount - a.overrideCount;
    }
    return compareStrings(a.name, b.name);
  });
  const deprecatedUsage = [
    ...deprecatedCounts.entries()
  ].map(([componentName, count]) => ({ componentName, count })).sort((a, b) => compareStrings(a.componentName, b.componentName)).slice(0, CAP);
  const detachedCandidates = [...detached].sort((a, b) => compareStrings(a.nodeId, b.nodeId)).slice(0, CAP);
  return {
    overrideHotspots: hotspots.slice(0, CAP),
    deprecatedUsage,
    detachedCandidates,
    totals
  };
}

// src/io/figma/cache.ts
import { dirname as dirname6, join as join16 } from "path";
function cachePath(args) {
  const fileName = `library-${args.key}.json`;
  const dataDir = args.env.CLAUDE_PLUGIN_DATA;
  if (dataDir !== void 0 && dataDir !== "") {
    return join16(dataDir, "figma", fileName);
  }
  return join16(args.cwd, ".ds-bridge", "cache", fileName);
}
function isEnvelope(value2) {
  return typeof value2 === "object" && value2 !== null && typeof value2.stampedAtMs === "number";
}
function readCache(args) {
  const path = cachePath({ key: args.key, env: args.env, cwd: args.cwd });
  if (!args.fs.exists(path)) return { kind: "miss" };
  let envelope;
  try {
    const parsed = JSON.parse(args.fs.read(path));
    if (!isEnvelope(parsed)) return { kind: "miss" };
    envelope = parsed;
  } catch {
    return { kind: "miss" };
  }
  const ageMs = args.now - envelope.stampedAtMs;
  if (ageMs > args.ttlMs) return { kind: "stale", ageMs };
  return { kind: "hit", data: envelope.data, ageMs };
}
function writeCache(args) {
  const path = cachePath({ key: args.key, env: args.env, cwd: args.cwd });
  const envelope = { stampedAtMs: args.now, data: args.data };
  try {
    args.fs.mkdir(dirname6(path));
    args.fs.write(path, `${JSON.stringify(envelope, null, 2)}
`);
  } catch {
  }
}

// src/cli-commands/library-health.ts
var DEFAULT_FIGMA_API_BASE5 = "https://api.figma.com";
var CACHE_TTL_MS = 60 * 60 * 1e3;
function fail10(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function missingTokenMessage4() {
  return [
    "No Figma personal access token configured.",
    "",
    "Connect Figma via the plugin config dialog (stored in the system keychain)",
    "or, for standalone CLI use, export FIGMA_TOKEN with a Dev/Full-seat PAT:",
    "",
    "  export FIGMA_TOKEN=figd_your_token_here",
    "",
    "The token needs the file_content:read scope, and must come from a Dev or",
    "Full seat \u2014 a View seat is rate-limited and cannot be used here."
  ].join("\n");
}
function missingFileKeyMessage2() {
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
function readProjectConfigText4() {
  const configPath = join17(cwd4(), ".ds-bridge.json");
  if (!existsSync12(configPath)) return void 0;
  try {
    return readFileSync14(configPath, "utf8");
  } catch {
    return void 0;
  }
}
function unknownAliasMessage3(outcome, productFileKeys) {
  const aliases = Object.keys(productFileKeys);
  const lines = [`Unknown --file-key alias "${outcome.alias}".`];
  if (outcome.suggestions.length > 0) {
    lines.push(`Did you mean ${outcome.suggestions.join(", ")}?`);
  }
  lines.push(
    "",
    aliases.length > 0 ? `Available product_file_keys aliases: ${aliases.join(", ")}.` : "No product_file_keys aliases are configured.",
    "Or pass --file-key <raw-figma-file-key> directly."
  );
  return lines.join("\n");
}
function clientErrorMessage4(result) {
  switch (result.kind) {
    case "auth-error":
      return "Figma rejected the token (auth error). Check that FIGMA_TOKEN is a valid Dev/Full-seat personal access token.";
    case "scope-error":
      return `Figma token is missing a required scope: ${result.message}. The token needs file_content:read.`;
    case "not-found":
      return "Figma could not find that file. Check the file key is correct and the token's account can access the library.";
    case "rate-limited":
      return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited \u2014 use a Dev/Full-seat PAT.`;
    case "network-error":
      return `Could not reach the Figma API: ${result.message}.`;
  }
}
var fsAdapter = {
  exists: (path) => existsSync12(path),
  read: (path) => readFileSync14(path, "utf8"),
  mkdir: (path) => {
    mkdirSync11(path, { recursive: true });
  },
  write: (path, content) => {
    writeFileSync7(path, content, "utf8");
  }
};
function appendLibraryHealthHistory(totals) {
  const stateDir = join17(cwd4(), ".ds-bridge");
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "library-health",
    overrideHotspots: totals.overrideHotspots,
    deprecatedUsage: totals.deprecatedUsage,
    detachedCandidates: totals.detachedCandidates
  };
  mkdirSync11(stateDir, { recursive: true });
  appendFileSync8(
    join17(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
function renderTerm9(report, color) {
  const { totals } = report;
  const clean = totals.overrideHotspots === 0 && totals.deprecatedUsage === 0 && totals.detachedCandidates === 0;
  const header = severityColor(
    clean ? "ok" : "warn",
    clean ? "Library health: no hygiene signals found." : "Library health \u2014 hygiene signals found (informational).",
    { color }
  );
  const summary = renderTable(
    ["signal", "count"],
    [
      ["override hotspots", String(totals.overrideHotspots)],
      ["deprecated usage", String(totals.deprecatedUsage)],
      ["detached candidates", String(totals.detachedCandidates)]
    ],
    { color }
  );
  const lines = [header, "", summary];
  if (report.overrideHotspots.length > 0) {
    lines.push("", "Top override hotspots:");
    for (const h of report.overrideHotspots) {
      const named2 = h.componentName !== void 0 ? ` (${h.componentName})` : "";
      lines.push(`  ${h.name}${named2}: ${h.overrideCount} override(s)`);
    }
  }
  lines.push(
    "",
    `Detached candidates: ${totals.detachedCandidates} \u2014 heuristic \u2014 REST cannot truly detect detachment; expect false positives.`
  );
  return lines.join("\n");
}
async function runLibraryHealth(options) {
  const format = options.format;
  if (format !== "json" && format !== "term") {
    fail10(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const projectFileText = readProjectConfigText4();
  const resolved = resolveConfig({
    env: process.env,
    ...projectFileText !== void 0 ? { projectFileText } : {}
  });
  if (resolved.kind !== "ok") {
    fail10(resolved.message);
    return;
  }
  for (const warning of resolved.warnings) {
    process.stderr.write(`warning: ${warning}
`);
  }
  const { config } = resolved;
  if (config.figmaToken.kind === "missing") {
    fail10(missingTokenMessage4());
    return;
  }
  const fileKeyOutcome = resolveFileKey({
    ...options.fileKey !== void 0 ? { flagValue: options.fileKey } : {},
    productFileKeys: config.productFileKeys,
    ...config.figmaFileKey !== void 0 ? { defaultKey: config.figmaFileKey } : {}
  });
  if (fileKeyOutcome.kind === "unknown-alias") {
    fail10(unknownAliasMessage3(fileKeyOutcome, config.productFileKeys));
    return;
  }
  if (fileKeyOutcome.kind === "missing") {
    fail10(missingFileKeyMessage2());
    return;
  }
  const fileKey = fileKeyOutcome.key;
  const cacheEnv = processEnv2.CLAUDE_PLUGIN_DATA !== void 0 ? { CLAUDE_PLUGIN_DATA: processEnv2.CLAUDE_PLUGIN_DATA } : {};
  const cacheArgs = {
    key: fileKey,
    env: cacheEnv,
    cwd: cwd4()
  };
  let file;
  if (!options.refresh) {
    const cached = readCache({
      ...cacheArgs,
      fs: fsAdapter,
      now: Date.now(),
      ttlMs: CACHE_TTL_MS
    });
    if (cached.kind === "hit") {
      file = cached.data;
    }
  }
  if (file === void 0) {
    const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE5;
    const client = createFigmaClient({
      token: config.figmaToken.value,
      baseUrl
    });
    const result = await client.getFile(fileKey);
    if (result.kind === "ok") {
      file = result.data;
      writeCache({
        ...cacheArgs,
        fs: fsAdapter,
        now: Date.now(),
        data: result.data
      });
    } else if (result.kind === "rate-limited") {
      process.stderr.write(`warning: ${clientErrorMessage4(result)}
`);
      const fallback = existsSync12(cachePath(cacheArgs)) ? readCache({
        ...cacheArgs,
        fs: fsAdapter,
        now: Date.now(),
        // A huge TTL so any present envelope counts as a hit.
        ttlMs: Number.MAX_SAFE_INTEGER
      }) : { kind: "miss" };
      if (fallback.kind === "hit") {
        file = fallback.data;
      } else {
        process.exitCode = 2;
        return;
      }
    } else {
      fail10(clientErrorMessage4(result));
      return;
    }
  }
  const report = assessLibraryHealth(file);
  appendLibraryHealthHistory(report.totals);
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
  } else {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    process.stdout.write(`${renderTerm9(report, color)}
`);
  }
  process.exitCode = 0;
}
function registerLibraryHealthCommand(program2) {
  program2.command("library-health").description(
    "Crawl a Figma file for design-system hygiene signals (override hotspots, deprecated usage, detached-instance candidates)"
  ).option(
    "--file-key <keyOrAlias>",
    "Figma file key OR a product_file_keys alias (overrides config)"
  ).option("--format <format>", "output format: term | json", "term").option("--refresh", "bypass the response cache and re-crawl", false).action((options) => {
    void runLibraryHealth(options);
  });
}

// src/cli-commands/lint.ts
import { spawnSync as spawnSync2 } from "child_process";
import {
  appendFileSync as appendFileSync9,
  existsSync as existsSync13,
  mkdirSync as mkdirSync12,
  readdirSync as readdirSync3,
  readFileSync as readFileSync15,
  statSync as statSync6,
  writeFileSync as writeFileSync8
} from "fs";
import { isAbsolute as isAbsolute3, join as join18, relative, resolve as resolve9, sep as sep3 } from "path";

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
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (let j = i; j < stop; j++) out += text[j] === "\n" ? "\n" : " ";
      i = stop;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/" && text[i - 1] !== ":") {
      let j = i;
      while (j < text.length && text[j] !== "\n") {
        out += " ";
        j += 1;
      }
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += ch;
      i += 1;
      while (i < text.length && text[i] !== ch) {
        out += text[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < text.length) {
        out += text[i];
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
function* scanValue(value2, property) {
  const spacing = isSpacingProperty(property);
  let i = 0;
  while (i < value2.length) {
    const rest = value2.slice(i);
    if (/^var\s*\(/i.test(rest)) {
      const close = value2.indexOf(")", i);
      i = close === -1 ? value2.length : close + 1;
      continue;
    }
    const fn5 = COLOR_FN_RE.exec(rest);
    if (fn5 !== null && fn5.index === 0) {
      yield { offset: i, raw: fn5[0], valueKind: "color" };
      i += fn5[0].length;
      continue;
    }
    if (value2[i] === "#") {
      const hex2 = HEX_RE.exec(rest);
      if (hex2 !== null && hex2.index === 0) {
        yield { offset: i, raw: hex2[0], valueKind: "color" };
        i += hex2[0].length;
        continue;
      }
    }
    if (spacing && (value2[i] === "-" || /\d/.test(value2[i] ?? ""))) {
      const prev = value2[i - 1] ?? " ";
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
      const value2 = m[2] ?? "";
      const valueStart = m.index + m[0].length - value2.length;
      for (const hit of scanValue(value2, property)) {
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
function isColorLiteral(value2) {
  const v = value2.trim();
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

// src/engines/lint/adoption.ts
function countTokenRefs(css) {
  const masked = blankComments(css);
  const refRe = /\bvar\s*\(\s*--[\w-]+/gi;
  let count = 0;
  while (refRe.exec(masked) !== null) count += 1;
  return count;
}
var BY_DIRECTORY_CAP = 20;
function dirnameOf(path) {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}
function pct2(refs, literals) {
  const denom = refs + literals;
  return denom === 0 ? 0 : refs / denom;
}
function tallyAdoption(files) {
  const totals = { refs: 0, literals: 0 };
  const byDir = /* @__PURE__ */ new Map();
  for (const file of files) {
    totals.refs += file.refs;
    totals.literals += file.literals;
    const dir = dirnameOf(file.path);
    const bucket = byDir.get(dir);
    if (bucket === void 0) {
      byDir.set(dir, { dir, refs: file.refs, literals: file.literals });
    } else {
      bucket.refs += file.refs;
      bucket.literals += file.literals;
    }
  }
  const byDirectory = [...byDir.values()].filter((d) => d.refs + d.literals > 0).sort((a, b) => {
    const pa = pct2(a.refs, a.literals);
    const pb = pct2(b.refs, b.literals);
    if (pa !== pb) return pa - pb;
    return a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0;
  }).slice(0, BY_DIRECTORY_CAP);
  return { totals, byDirectory };
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

// src/engines/lint/match.ts
var COLOR_NEAR_DELTA_E2 = 2.5;
var DIMENSION_NEAR_PX2 = 1;
var NEAR_LIMIT2 = 3;
function pickPreferred2(tokens) {
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
    const token = pickPreferred2(exact);
    if (token !== void 0) return { kind: "exact", token };
  }
  const composite = options?.compositeColors?.get(canonical2);
  if (composite !== void 0 && composite.length > 0) {
    const token = pickPreferred2(composite);
    if (token !== void 0) return { kind: "exact", token };
  }
  const near = index.nearest(canonical2, {
    maxDeltaE: COLOR_NEAR_DELTA_E2,
    limit: NEAR_LIMIT2
  });
  if (near.length === 0) return { kind: "off-system" };
  const candidates = near.map((m) => ({ token: m.token, distance: m.deltaE })).sort(
    (a, b) => a.distance !== b.distance ? a.distance - b.distance : aliasRank(a.token) - aliasRank(b.token)
  ).slice(0, NEAR_LIMIT2);
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
    if (distance === 0 || distance > DIMENSION_NEAR_PX2) continue;
    candidates.push({ token, distance });
  }
  if (candidates.length === 0) return { kind: "off-system" };
  candidates.sort(
    (a, b) => a.distance !== b.distance ? a.distance - b.distance : a.token.name < b.token.name ? -1 : a.token.name > b.token.name ? 1 : 0
  );
  return { kind: "near", candidates: candidates.slice(0, NEAR_LIMIT2) };
}
function matchLiteral(literal, index, options) {
  return literal.valueKind === "color" ? matchColor(literal, index, options) : matchDimension(literal, index);
}
function buildCompositeColorLookup(tokens) {
  const lookup = /* @__PURE__ */ new Map();
  for (const token of tokens) {
    const { value: value2 } = token;
    if (typeof value2 !== "object" || value2 === null) continue;
    const inner = value2.color;
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

// src/cli-commands/lint.ts
var PARSERS4 = {
  w3c: parseW3c,
  "tokens-studio": parseTokensStudio,
  "style-dictionary": parseStyleDictionary
};
var EXCLUDED_DIRS3 = /* @__PURE__ */ new Set([
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
function computeAdoption(files, findings) {
  const cssFiles = files.filter((f3) => isCssLike(f3.rel));
  const literalsByFile = /* @__PURE__ */ new Map();
  for (const finding of findings) {
    const rel2 = finding.literal.file;
    if (!isCssLike(rel2)) continue;
    literalsByFile.set(rel2, (literalsByFile.get(rel2) ?? 0) + 1);
  }
  const perFile = cssFiles.map((file) => {
    let refs = 0;
    try {
      refs = countTokenRefs(readFileSync15(file.abs, "utf8"));
    } catch {
      refs = 0;
    }
    return {
      path: file.rel,
      refs,
      literals: literalsByFile.get(file.rel) ?? 0
    };
  });
  const tally2 = tallyAdoption(perFile);
  return {
    refs: tally2.totals.refs,
    literals: tally2.totals.literals,
    byDirectory: tally2.byDirectory
  };
}
function isCssLike(path) {
  const lower = path.toLowerCase();
  return lower.endsWith(".css") || lower.endsWith(".scss");
}
function appendLintHistory(targetDir, findings, files) {
  const stateDir = join18(targetDir, ".ds-bridge");
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "lint",
    byKind: countByKind(findings),
    adoption: computeAdoption(files, findings)
  };
  mkdirSync12(stateDir, { recursive: true });
  appendFileSync9(
    join18(stateDir, "history.jsonl"),
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
    entries = readdirSync3(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join18(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS3.has(entry.name)) continue;
      walkLintableFiles(full, acc);
      continue;
    }
    if (entry.isFile() && hasExtension(entry.name)) acc.push(full);
  }
}
function resolveTokenSource(targetDir, flagTokens) {
  if (flagTokens !== void 0) {
    const abs2 = isAbsolute3(flagTokens) ? flagTokens : resolve9(process.cwd(), flagTokens);
    if (!existsSync13(abs2)) {
      return {
        kind: "error",
        message: `Token source "${abs2}" (from --tokens) does not exist.`
      };
    }
    return { kind: "ok", path: abs2 };
  }
  const configPath = join18(targetDir, ".ds-bridge.json");
  if (existsSync13(configPath)) {
    let projectFileText;
    try {
      projectFileText = readFileSync15(configPath, "utf8");
    } catch {
      projectFileText = void 0;
    }
    if (projectFileText !== void 0) {
      const resolved = resolveConfig({ projectFileText });
      if (resolved.kind === "ok" && resolved.config.tokenSource !== void 0) {
        const src = resolved.config.tokenSource;
        const abs2 = isAbsolute3(src) ? src : resolve9(targetDir, src);
        if (existsSync13(abs2)) return { kind: "ok", path: abs2 };
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
function discoverFirstTokenSource2(root) {
  const candidates = [];
  collectTokenCandidates2(root, false, candidates);
  const verified = candidates.filter((path) => detectFileFormat3(path) !== void 0).sort((a, b) => {
    const depth = depthOf3(a) - depthOf3(b);
    return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
  });
  return verified[0];
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
    entries = readdirSync3(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join18(dir, entry.name);
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
    raw = readFileSync15(absPath, "utf8");
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
    raw = readFileSync15(tokenPath, "utf8");
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
  const outcome = PARSERS4[format](parsed);
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
    content = readFileSync15(absPath, "utf8");
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
function renderTerm10(findings, color) {
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
    result.stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).map((rel2) => resolve9(targetDir, rel2))
  );
  return { kind: "ok", files };
}
function applyFixes(editsByFile) {
  let changed = 0;
  for (const [absPath, edits] of editsByFile) {
    let content;
    try {
      content = readFileSync15(absPath, "utf8");
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
      writeFileSync8(absPath, next, "utf8");
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
function fail11(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function registerLintCommand(program2) {
  program2.command("lint").description("Find raw values that should be design tokens").argument("[path]", "file or directory to lint", ".").option("--fix", "rewrite fixable exact matches to var() in place", false).option("--format <format>", "output format: term | json", "term").option("--tokens <file>", "explicit token source file").option("--changed", "limit to files changed vs git HEAD", false).action((path, options) => {
    const format = options.format;
    if (format !== "json" && format !== "term") {
      fail11(
        `Unknown --format "${options.format}". Expected "json" or "term".`
      );
      return;
    }
    const targetPath = resolve9(path);
    if (!existsSync13(targetPath)) {
      fail11(`Path "${targetPath}" does not exist.`);
      return;
    }
    const stat2 = statSync6(targetPath);
    const isFile = stat2.isFile();
    if (isFile && !hasExtension(targetPath)) {
      fail11(
        `Path "${targetPath}" is not a lintable file (expected ${LINTABLE_EXTENSIONS.join(", ")}).`
      );
      return;
    }
    const targetDir = isFile ? process.cwd() : targetPath;
    const tokenSource = resolveTokenSource(targetDir, options.tokens);
    if (tokenSource.kind === "error") {
      fail11(tokenSource.message);
      return;
    }
    const loaded = loadTokenMap(tokenSource.path);
    if (loaded.kind === "error") {
      fail11(loaded.message);
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
        fail11(changed.message);
        return;
      }
      inScope = walked.filter((abs2) => changed.files.has(abs2));
    }
    const files = inScope.map((abs2) => ({ abs: abs2, rel: toRelative(targetDir, abs2) })).sort((a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);
    const linted = lintAll(files, tokens);
    if (linted.kind === "error") {
      fail11(linted.message);
      return;
    }
    if (options.fix) {
      runFix(files, tokens, linted.findings, isFile ? void 0 : targetDir);
      return;
    }
    emitReport(linted.findings, format);
    if (!isFile) {
      const adoption = computeAdoption(files, linted.findings);
      appendLintHistory(targetDir, linted.findings, files);
      if (format === "term") emitAdoptionSummary(adoption);
    }
    process.exitCode = linted.findings.length > 0 ? 1 : 0;
  });
}
function toRelative(targetDir, abs2) {
  const rel2 = relative(targetDir, abs2);
  return rel2.split(sep3).join("/");
}
function emitAdoptionSummary(adoption) {
  const total = adoption.refs + adoption.literals;
  const pct5 = total === 0 ? 0 : Math.round(adoption.refs / total * 100);
  process.stdout.write(
    `on-system: ${pct5}% (${adoption.refs} token refs / ${total} css/scss values)
`
  );
}
function emitReport(findings, format) {
  if (format === "json") {
    const json = findings.map(toJsonFinding);
    process.stdout.write(`${JSON.stringify(json, null, 2)}
`);
    return;
  }
  const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
  process.stdout.write(`${renderTerm10(findings, color)}
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
    fail11(applied.message);
    return;
  }
  process.stdout.write(
    `Changed ${applied.changed} file${applied.changed === 1 ? "" : "s"}.
`
  );
  const relinted = lintAll(files, tokens);
  if (relinted.kind === "error") {
    fail11(relinted.message);
    return;
  }
  const remaining = relinted.findings.filter((f3) => f3.match.kind !== "exact");
  const stillExact = relinted.findings.filter((f3) => f3.match.kind === "exact");
  const hasRemaining = remaining.length > 0 || stillExact.length > 0;
  if (historyDir !== void 0) {
    const adoption = computeAdoption(files, relinted.findings);
    appendLintHistory(historyDir, relinted.findings, files);
    emitAdoptionSummary(adoption);
  }
  process.exitCode = hasRemaining ? 1 : 0;
}

// src/cli-commands/parity.ts
import { existsSync as existsSync14, readFileSync as readFileSync16, statSync as statSync7 } from "fs";
import { join as join19, resolve as resolvePath4 } from "path";

// src/engines/registry/parity.ts
var OK_THRESHOLD = 0.85;
var SEVERITY_ORDER2 = {
  "missing-in-code": 0,
  "missing-in-figma": 1,
  "prop-mismatch": 2,
  ok: 3
};
function byNameAsc5(a, b) {
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
    return bySeverity !== 0 ? bySeverity : byNameAsc5(a.component, b.component);
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
function fail12(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function normalizeName3(name) {
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
function loadRegistry5(targetDir) {
  const registryPath = join19(targetDir, ".ds-bridge", "registry.json");
  if (!existsSync14(registryPath)) {
    fail12(
      `No registry found at "${registryPath}". Run "ds-bridge registry build" first.`
    );
    return void 0;
  }
  let raw;
  try {
    raw = readFileSync16(registryPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail12(`Could not read registry "${registryPath}": ${detail}`);
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail12(`Registry "${registryPath}" is not valid JSON: ${detail}`);
    return void 0;
  }
}
function filterRows(rows, component) {
  if (component === void 0 || component === "") return rows;
  const needle = normalizeName3(component);
  if (needle === "") return rows;
  return rows.filter((row) => normalizeName3(row.component).includes(needle));
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
function renderTerm11(report, color) {
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
function mdCell(value2) {
  return value2.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
function renderMarkdown(report) {
  const header = "| Component | Status | Detail |";
  const separator = "| --- | --- | --- |";
  const rows = report.rows.map(
    (row) => `| ${mdCell(row.component)} | ${mdCell(row.status)} | ${mdCell(row.detail)} |`
  );
  const { summary } = report;
  const summaryLine2 = `_ok: ${summary.ok} \xB7 prop-mismatch: ${summary.propMismatch} \xB7 missing-in-code: ${summary.missingInCode} \xB7 missing-in-figma: ${summary.missingInFigma}_`;
  return [header, separator, ...rows, "", summaryLine2].join("\n");
}
function hasRegistry2(candidate) {
  return existsSync14(
    join19(resolvePath4(candidate), ".ds-bridge", "registry.json")
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
    fail12(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const { component, path } = disambiguate2(rawComponent, rawPath);
  const targetDir = resolvePath4(path);
  if (!existsSync14(targetDir) || !statSync7(targetDir).isDirectory()) {
    fail12(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const registry = loadRegistry5(targetDir);
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
    process.stdout.write(`${renderTerm11(report, color)}
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
  appendFileSync as appendFileSync10,
  existsSync as existsSync15,
  mkdirSync as mkdirSync13,
  readFileSync as readFileSync17,
  statSync as statSync8,
  writeFileSync as writeFileSync9
} from "fs";
import { dirname as dirname7, join as join20, resolve as resolvePath5 } from "path";
import { fileURLToPath as fileURLToPath4 } from "url";

// src/engines/registry/match.ts
var MATCH_THRESHOLD = 0.6;
var AMBIGUITY_GAP = 0.1;
var TOKEN_SCORE_FLOOR = 0.3;
var NAME_WEIGHT = 0.7;
var SHAPE_WEIGHT = 0.3;
var MAX_CANDIDATES = 3;
function normalizeName4(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function tokenize4(name) {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Za-z])([0-9])/g, "$1 $2").replace(/([0-9])([A-Za-z])/g, "$1 $2");
  const tokens = [];
  for (const part of spaced.split(/[^a-zA-Z0-9]+/)) {
    const token = part.toLowerCase();
    if (token.length > 0) tokens.push(token);
  }
  return tokens;
}
function tokenSetScore(a, b) {
  const setA = new Set(tokenize4(a));
  const setB = new Set(tokenize4(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return 2 * intersection / (setA.size + setB.size);
}
function nameScore(codeName, figmaName) {
  if (normalizeName4(codeName) === normalizeName4(figmaName)) return 1;
  const score = tokenSetScore(codeName, figmaName);
  return score < TOKEN_SCORE_FLOOR ? 0 : score;
}
function valueJaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const value2 of setA) {
    if (setB.has(value2)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
function normalizedKeyIndex(variants) {
  const index = /* @__PURE__ */ new Map();
  for (const key of Object.keys(variants)) {
    const values = variants[key] ?? [];
    const norm = normalizeName4(key);
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
function byNameAsc6(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function rankFigmaCandidates(codeComponent, figma) {
  return figma.map((figmaModel) => ({
    figma: figmaModel,
    score: scorePair(codeComponent, figmaModel).score
  })).sort(
    (a, b) => a.score !== b.score ? b.score - a.score : byNameAsc6(a.figma.name, b.figma.name)
  ).slice(0, MAX_CANDIDATES);
}
function rankCodeCandidates(figmaModel, code) {
  return code.map((codeComponent) => ({
    code: codeComponent,
    score: scorePair(codeComponent, figmaModel).score
  })).sort(
    (a, b) => a.score !== b.score ? b.score - a.score : byNameAsc6(a.code.name, b.code.name)
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
    const byCode = byNameAsc6(codeA, codeB);
    if (byCode !== 0) return byCode;
    const figmaA = figma[a.figmaIndex]?.name ?? "";
    const figmaB = figma[b.figmaIndex]?.name ?? "";
    return byNameAsc6(figmaA, figmaB);
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
  matches.sort((a, b) => byNameAsc6(a.code.name, b.code.name));
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
  unmatchedCode.sort((a, b) => byNameAsc6(a.code.name, b.code.name));
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
  unmatchedFigma.sort((a, b) => byNameAsc6(a.figma.name, b.figma.name));
  return { matches, unmatchedCode, unmatchedFigma };
}

// src/cli-commands/registry.ts
async function scanCode2(targetDir) {
  const globals = globalThis;
  if (typeof globals.__filename !== "string") {
    const filename = fileURLToPath4(import.meta.url);
    globals.__filename = filename;
    globals.__dirname = dirname7(filename);
  }
  const { scanCodeComponents } = await import("./scan-code-XUHRU37J.mjs");
  return scanCodeComponents(targetDir);
}
var DEFAULT_FIGMA_API_BASE6 = "https://api.figma.com";
function fail13(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function missingTokenMessage5() {
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
function missingFileKeyMessage3() {
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
function clientErrorMessage5(result) {
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
    fail13(`Unknown --format "${options.format}". Expected "json" or "term".`);
    return;
  }
  const targetDir = resolvePath5(path);
  if (!existsSync15(targetDir) || !statSync8(targetDir).isDirectory()) {
    fail13(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const resolved = resolveConfig({ env: process.env });
  if (resolved.kind !== "ok") {
    fail13(resolved.message);
    return;
  }
  for (const warning of resolved.warnings) {
    process.stderr.write(`warning: ${warning}
`);
  }
  const { config } = resolved;
  if (config.figmaToken.kind === "missing") {
    fail13(missingTokenMessage5());
    return;
  }
  if (config.figmaFileKey === void 0 || config.figmaFileKey === "") {
    fail13(missingFileKeyMessage3());
    return;
  }
  const code = await scanCode2(targetDir);
  const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE6;
  const client = createFigmaClient({
    token: config.figmaToken.value,
    baseUrl
  });
  const componentsResult = await client.getComponents(config.figmaFileKey);
  if (componentsResult.kind !== "ok") {
    fail13(clientErrorMessage5(componentsResult));
    return;
  }
  const fileResult = await client.getFile(config.figmaFileKey);
  if (fileResult.kind !== "ok") {
    fail13(clientErrorMessage5(fileResult));
    return;
  }
  const figma = buildFigmaComponentModel({
    published: componentsResult.data,
    fileDocument: fileResult.data.document
  });
  const matchResult = matchComponents(code, figma);
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const registry = toRegistryFile(matchResult, generatedAt);
  const stateDir = join20(targetDir, ".ds-bridge");
  const registryPath = join20(stateDir, "registry.json");
  try {
    mkdirSync13(stateDir, { recursive: true });
    writeFileSync9(
      registryPath,
      `${JSON.stringify(registry, null, 2)}
`,
      "utf8"
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail13(`Could not write registry to "${registryPath}": ${detail}`);
    return;
  }
  const parityRecord = parityRecordFrom(registry, generatedAt);
  appendParityHistory(stateDir, parityRecord);
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(registry, null, 2)}
`);
  } else {
    process.stdout.write(
      `${renderBuildSummary(registry, registryPath, parityRecord)}
`
    );
  }
  process.exitCode = 0;
}
function parityRecordFrom(registry, generatedAt) {
  const { ok, missingInCode, missingInFigma, propMismatch } = buildParity(registry).summary;
  const total = ok + missingInCode + missingInFigma + propMismatch;
  const score = total > 0 ? Math.round(100 * ok / total) : 0;
  return {
    at: generatedAt,
    kind: "parity",
    total,
    ok,
    missingInCode,
    missingInFigma,
    propMismatch,
    score
  };
}
function appendParityHistory(stateDir, record) {
  try {
    mkdirSync13(stateDir, { recursive: true });
    appendFileSync10(
      join20(stateDir, "history.jsonl"),
      `${JSON.stringify(record)}
`,
      "utf8"
    );
  } catch {
  }
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
function renderBuildSummary(registry, registryPath, parity) {
  const lines = [
    `Registry written to ${registryPath}`,
    `  matched:        ${registry.matches.length}`,
    `  unmatched code: ${registry.unmatchedCode.length}`,
    `  unmatched figma:${registry.unmatchedFigma.length}`,
    `  parity score: ${parity.score} (${parity.ok}/${parity.total})`
  ];
  const ambiguities = worstAmbiguities(registry);
  if (ambiguities.length > 0) {
    lines.push("", "Closest near-misses:", ...ambiguities);
  }
  return lines.join("\n");
}
function loadRegistry6(targetDir) {
  const registryPath = join20(targetDir, ".ds-bridge", "registry.json");
  if (!existsSync15(registryPath)) {
    fail13(
      `No registry found at "${registryPath}". Run "ds-bridge registry build" first.`
    );
    return void 0;
  }
  let raw;
  try {
    raw = readFileSync17(registryPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail13(`Could not read registry "${registryPath}": ${detail}`);
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail13(`Registry "${registryPath}" is not valid JSON: ${detail}`);
    return void 0;
  }
}
function runResolve(nodeNameOrId, path) {
  const targetDir = resolvePath5(path);
  if (!existsSync15(targetDir) || !statSync8(targetDir).isDirectory()) {
    fail13(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const registry = loadRegistry6(targetDir);
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

// src/cli-commands/release-check.ts
import { existsSync as existsSync16, readFileSync as readFileSync18, statSync as statSync9 } from "fs";
import { join as join21, resolve as resolve10 } from "path";

// src/engines/report/release-readiness.ts
function asNumber3(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function extractReleaseSignals(records) {
  const signals = {};
  for (const { kind, record } of records) {
    switch (kind) {
      case "impact":
        signals.impact = { breaking: asNumber3(record.breaking) };
        break;
      case "tokens-check":
        signals.drift = {
          stale: asNumber3(record.stale),
          missing: asNumber3(record.missing)
        };
        break;
      case "parity":
        signals.parity = {
          missingInCode: asNumber3(record.missingInCode),
          missingInFigma: asNumber3(record.missingInFigma),
          total: asNumber3(record.total)
        };
        break;
      default:
        break;
    }
  }
  return signals;
}
function impactCheck(signal) {
  if (signal === void 0) {
    return { name: "impact", pass: false, detail: "no impact data" };
  }
  const breaking = asNumber3(signal.breaking);
  if (breaking === 0) {
    return { name: "impact", pass: true, detail: "no breaking changes" };
  }
  return {
    name: "impact",
    pass: false,
    detail: `${breaking} breaking change${breaking === 1 ? "" : "s"}`
  };
}
function driftCheck(signal) {
  if (signal === void 0) {
    return { name: "drift", pass: false, detail: "no drift data" };
  }
  const stale = asNumber3(signal.stale);
  const missing = asNumber3(signal.missing);
  if (stale === 0 && missing === 0) {
    return { name: "drift", pass: true, detail: "tokens in sync" };
  }
  return {
    name: "drift",
    pass: false,
    detail: `${stale} stale, ${missing} missing`
  };
}
function parityCheck(signal) {
  if (signal === void 0 || asNumber3(signal.total) === 0) {
    return { name: "parity", pass: false, detail: "no parity data" };
  }
  const missingInCode = asNumber3(signal.missingInCode);
  const missingInFigma = asNumber3(signal.missingInFigma);
  if (missingInCode === 0 && missingInFigma === 0) {
    return { name: "parity", pass: true, detail: "full parity" };
  }
  return {
    name: "parity",
    pass: false,
    detail: `${missingInCode} missing in code, ${missingInFigma} missing in figma`
  };
}
function evaluateReleaseReadiness(signals) {
  const checks = [
    impactCheck(signals.impact),
    driftCheck(signals.drift),
    parityCheck(signals.parity)
  ];
  return { go: checks.every((c2) => c2.pass), checks };
}

// src/cli-commands/release-check.ts
function fail14(message) {
  process.stderr.write(`${message}
`);
  process.exitCode = 2;
}
function readHistoryText2(stateDir) {
  try {
    return readFileSync18(join21(stateDir, "history.jsonl"), "utf8");
  } catch {
    return "";
  }
}
function renderTerm12(readiness) {
  const headline = `RELEASE: ${readiness.go ? "GO" : "NO-GO"}`;
  const rows = readiness.checks.map((check) => [
    check.name,
    check.pass ? "pass" : "fail",
    check.detail ?? ""
  ]);
  const table = renderTable(["gate", "status", "detail"], rows, {
    color: false
  });
  return `${headline}
${table}`;
}
function runReleaseCheck(path, options) {
  const format = options.format;
  if (format !== "term" && format !== "json") {
    fail14(`Unknown --format "${options.format}". Expected "term" or "json".`);
    return;
  }
  const targetDir = resolve10(path);
  if (!existsSync16(targetDir) || !statSync9(targetDir).isDirectory()) {
    fail14(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const stateDir = join21(targetDir, ".ds-bridge");
  const signals = extractReleaseSignals(
    replayHistory(readHistoryText2(stateDir))
  );
  const readiness = evaluateReleaseReadiness(signals);
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(readiness, null, 2)}
`);
  } else {
    process.stdout.write(`${renderTerm12(readiness)}
`);
  }
  process.exitCode = readiness.go ? 0 : 1;
}
function registerReleaseCheckCommand(program2) {
  program2.command("release-check").description(
    "Pre-publish go/no-go gate over the project history (exit 0 go / 1 no-go / 2 error)"
  ).argument(
    "[path]",
    "project directory holding .ds-bridge/history.jsonl",
    "."
  ).option("--format <format>", "output format: term | json", "term").action((path, options) => {
    runReleaseCheck(path, options);
  });
}

// src/cli-commands/report.ts
import { spawn } from "child_process";
import {
  existsSync as existsSync17,
  mkdirSync as mkdirSync14,
  readFileSync as readFileSync19,
  statSync as statSync10,
  writeFileSync as writeFileSync10
} from "fs";
import { basename, dirname as dirname8, join as join22, resolve as resolve11 } from "path";
import { platform } from "process";

// src/engines/report/audience-changelog.ts
var RECENT_CAP = 12;
function breakingRank2(severity) {
  return severity === "breaking" ? 0 : 1;
}
var SEVERITY_FIELD = {
  breaking: "breaking",
  notable: "additive",
  minor: "cosmetic"
};
function asObject2(value2) {
  return typeof value2 === "object" && value2 !== null ? value2 : void 0;
}
function asAudience(value2) {
  return value2 === "designer" || value2 === "developer" || value2 === "both" ? value2 : void 0;
}
function asSeverity(value2) {
  return value2 === "breaking" || value2 === "notable" || value2 === "minor" ? value2 : void 0;
}
function toEntry(raw, order) {
  const obj = asObject2(raw);
  if (obj === void 0) return void 0;
  const audience = asAudience(obj.audience);
  const severity = asSeverity(obj.severity);
  if (audience === void 0 || severity === void 0) return void 0;
  const title = typeof obj.title === "string" ? obj.title : "";
  return { audience, severity, title, order };
}
function inAudience2(entry, audience) {
  return entry.audience === audience || entry.audience === "both";
}
function buildSlice(label, audience, entries) {
  const scoped = entries.filter((e4) => inAudience2(e4, audience));
  if (scoped.length === 0) return void 0;
  const counts = { breaking: 0, additive: 0, cosmetic: 0 };
  for (const entry of scoped) {
    counts[SEVERITY_FIELD[entry.severity]] += 1;
  }
  const recent = scoped.slice().sort(
    (a, b) => breakingRank2(a.severity) - breakingRank2(b.severity) || a.order - b.order
  ).slice(0, RECENT_CAP).map((e4) => e4.title);
  return { audience: label, ...counts, recent };
}
function buildAudienceChangelog(latest) {
  if (latest === void 0) return { slices: [] };
  const rawRecent = Array.isArray(latest.recent) ? latest.recent : [];
  const entries = [];
  for (let i = 0; i < rawRecent.length; i += 1) {
    const entry = toEntry(rawRecent[i], i);
    if (entry !== void 0) entries.push(entry);
  }
  const slices = [];
  const designers = buildSlice("designers", "designer", entries);
  if (designers !== void 0) slices.push(designers);
  const developers = buildSlice("developers", "developer", entries);
  if (developers !== void 0) slices.push(developers);
  return { slices };
}

// src/engines/report/component-health.ts
var PARITY_DEDUCTION = {
  ok: 0,
  "prop-mismatch": 15,
  "missing-in-code": 30,
  "missing-in-figma": 30
};
var OVERRIDE_PER_HOTSPOT = 10;
var OVERRIDE_CAP = 20;
var DEPRECATED_DEDUCTION = 20;
var DETACHED_DEDUCTION = 10;
var READINESS_WEIGHT = 0.3;
var CONTRAST_PER_FAIL = 5;
var CONTRAST_CAP = 20;
function normalizeName5(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function isFiniteNumber(value2) {
  return typeof value2 === "number" && Number.isFinite(value2);
}
function clampScore(value2) {
  return Math.min(100, Math.max(0, Math.round(value2)));
}
function buildComponentHealth(input) {
  const byComponent = /* @__PURE__ */ new Map();
  const get = (component) => {
    let acc = byComponent.get(component);
    if (acc === void 0) {
      acc = { component, deduction: 0, issues: [] };
      byComponent.set(component, acc);
    }
    return acc;
  };
  for (const parityRow of input.parityRows ?? []) {
    if (parityRow === null || typeof parityRow !== "object") continue;
    const component = parityRow.component;
    if (typeof component !== "string" || component === "") continue;
    const status = parityRow.status;
    const deduction = PARITY_DEDUCTION[status];
    if (deduction === void 0) continue;
    const acc = get(component);
    if (deduction > 0) {
      acc.deduction += deduction;
      acc.issues.push(`parity: ${status}`);
    }
  }
  const lh = input.libraryHealth;
  if (lh !== void 0) {
    const overrideCounts = /* @__PURE__ */ new Map();
    for (const hotspot of lh.overrideHotspots ?? []) {
      if (hotspot === null || typeof hotspot !== "object") continue;
      const name = hotspot.componentName;
      if (typeof name !== "string" || name === "") continue;
      overrideCounts.set(name, (overrideCounts.get(name) ?? 0) + 1);
    }
    for (const [name, count] of overrideCounts) {
      const acc = get(name);
      const deduction = Math.min(OVERRIDE_CAP, count * OVERRIDE_PER_HOTSPOT);
      acc.deduction += deduction;
      acc.issues.push(`${count} override hotspot${count === 1 ? "" : "s"}`);
    }
    for (const group of lh.deprecatedUsage ?? []) {
      if (group === null || typeof group !== "object") continue;
      const name = group.componentName;
      if (typeof name !== "string" || name === "") continue;
      const acc = get(name);
      acc.deduction += DEPRECATED_DEDUCTION;
      const count = isFiniteNumber(group.count) ? group.count : 0;
      acc.issues.push(`deprecated usage${count > 0 ? ` (${count})` : ""}`);
    }
    for (const candidate of lh.detachedCandidates ?? []) {
      if (candidate === null || typeof candidate !== "object") continue;
      const name = candidate.name;
      if (typeof name !== "string" || name === "") continue;
      const acc = get(name);
      acc.deduction += DETACHED_DEDUCTION;
      acc.issues.push("detached candidate (heuristic)");
    }
  }
  const readiness = input.readiness;
  if (readiness !== void 0 && typeof readiness.frameName === "string" && isFiniteNumber(readiness.score)) {
    const target = matchByKeyOrName(
      [...byComponent.keys()],
      input.aliases,
      "frameName",
      readiness.frameName
    );
    if (target !== void 0 && readiness.score < 100) {
      const acc = get(target);
      acc.deduction += Math.round((100 - readiness.score) * READINESS_WEIGHT);
      acc.issues.push(`readiness ${readiness.score}`);
    }
  }
  const a11y = input.a11y;
  if (a11y !== void 0 && Array.isArray(a11y.modes)) {
    for (const mode of a11y.modes) {
      if (mode === null || typeof mode !== "object") continue;
      if (typeof mode.mode !== "string") continue;
      const failed = isFiniteNumber(mode.failed) ? mode.failed : 0;
      if (failed <= 0) continue;
      const target = matchByKeyOrName(
        [...byComponent.keys()],
        input.aliases,
        "contrastMode",
        mode.mode
      );
      if (target === void 0) continue;
      const acc = get(target);
      acc.deduction += Math.min(CONTRAST_CAP, failed * CONTRAST_PER_FAIL);
      acc.issues.push(`contrast: ${failed} failing`);
    }
  }
  return [...byComponent.values()].map(
    (acc) => ({
      component: acc.component,
      healthScore: clampScore(100 - acc.deduction),
      issues: acc.issues
    })
  ).sort(
    (a, b) => a.healthScore - b.healthScore || (a.component < b.component ? -1 : a.component > b.component ? 1 : 0)
  );
}
function matchByKeyOrName(components, aliases, key, signalValue) {
  if (aliases !== void 0) {
    for (const component of components) {
      if (aliases[component]?.[key] === signalValue) return component;
    }
  }
  const needle = normalizeName5(signalValue);
  if (needle === "") return void 0;
  for (const component of components) {
    if (normalizeName5(component) === needle) return component;
  }
  return void 0;
}

// src/engines/report/consumer.ts
var SOURCE_RANK = { tokens: 0, figma: 1 };
function finiteNumber(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : void 0;
}
function tokensDetail(count) {
  return `${count} stale output${count === 1 ? "" : "s"}`;
}
function figmaDetail(count) {
  return `${count} breaking component change${count === 1 ? "" : "s"}`;
}
function buildBreakingCalendar(records) {
  const entries = [];
  for (const { kind, at, record } of records) {
    if (at === void 0) continue;
    const date = at.slice(0, 10);
    if (kind === "tokens-check") {
      const stale = finiteNumber(record.stale);
      if (stale !== void 0 && stale > 0) {
        entries.push({
          date,
          source: "tokens",
          count: stale,
          detail: tokensDetail(stale)
        });
      }
    }
    if (kind === "impact") {
      const breaking = finiteNumber(record.breaking);
      if (breaking !== void 0 && breaking > 0) {
        entries.push({
          date,
          source: "figma",
          count: breaking,
          detail: figmaDetail(breaking)
        });
      }
    }
  }
  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const bySource = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (bySource !== 0) return bySource;
    return a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0;
  });
  const total = entries.reduce((sum, e4) => sum + e4.count, 0);
  return { entries, total };
}
var FREQUENCY_ORDER = [
  "tokens-check",
  "lint",
  "handoff",
  "a11y",
  "impact",
  "adoption",
  "library-health"
];
var FREQUENCY_KINDS = new Set(FREQUENCY_ORDER);
function buildChangeFrequency(records) {
  const counts = /* @__PURE__ */ new Map();
  let windowFirst;
  let windowLast;
  for (const { kind, at } of records) {
    if (FREQUENCY_KINDS.has(kind)) {
      const k4 = kind;
      counts.set(k4, (counts.get(k4) ?? 0) + 1);
    }
    if (at !== void 0) {
      if (windowFirst === void 0 || at < windowFirst) windowFirst = at;
      if (windowLast === void 0 || at > windowLast) windowLast = at;
    }
  }
  const byKind = [];
  for (const kind of FREQUENCY_ORDER) {
    const count = counts.get(kind) ?? 0;
    if (count > 0) byKind.push({ kind, count });
  }
  const result = { byKind };
  if (windowFirst !== void 0) result.windowFirst = windowFirst;
  if (windowLast !== void 0) result.windowLast = windowLast;
  return result;
}

// src/engines/report/frame-implementability.ts
var TOP_GAPS_CAP = 5;
var EMPTY2 = {
  pct: 0,
  resolved: 0,
  total: 0,
  gaps: []
};
function asObject3(value2) {
  return typeof value2 === "object" && value2 !== null ? value2 : void 0;
}
function asNumber4(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function clamp012(value2) {
  return Math.min(100, Math.max(0, value2));
}
function bucketsFromByReason(byReason) {
  if (byReason === void 0) return [];
  const buckets = [];
  for (const [reason, raw] of Object.entries(byReason)) {
    const count = asNumber4(raw);
    if (count > 0) buckets.push({ reason, count });
  }
  return buckets.sort(
    (a, b) => b.count - a.count || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0)
  );
}
function buildFrameImplementability(latest) {
  if (latest === void 0) return EMPTY2;
  const byReason = asObject3(latest.byReason);
  const buckets = bucketsFromByReason(byReason);
  const gaps = buckets.slice(0, TOP_GAPS_CAP);
  const resolved = asNumber4(latest.resolvedCount);
  const byReasonSum = buckets.reduce((sum, g) => sum + g.count, 0);
  const gapCount = byReasonSum > 0 ? byReasonSum : asNumber4(latest.gapCount);
  const total = resolved + gapCount;
  const recordedPct = typeof latest.pct === "number" && Number.isFinite(latest.pct) ? clamp012(latest.pct) : void 0;
  const pct5 = recordedPct ?? (total <= 0 ? 0 : clamp012(Math.round(100 * resolved / total)));
  return { pct: pct5, resolved, total, gaps };
}

// src/engines/report/freshness.ts
var MS_PER_DAY2 = 24 * 60 * 60 * 1e3;
var FRESHNESS_TRACKED_KINDS = [
  "drift",
  "lint",
  "readiness",
  "a11y",
  "impact",
  "adoption",
  "parity",
  "library-health",
  "changelog",
  "frame-impl"
];
function logicalKindFor(rawKind) {
  switch (rawKind) {
    case "tokens-check":
      return "drift";
    case "handoff":
      return "readiness";
    case "lint":
    case "a11y":
    case "impact":
    case "adoption":
    case "parity":
    case "library-health":
    case "changelog":
    case "frame-impl":
      return rawKind;
    default:
      return void 0;
  }
}
function bandFor(kind, thresholds) {
  return thresholds?.[kind] ?? DEFAULT_FRESHNESS_THRESHOLDS[kind];
}
function classify(ageDays, band) {
  if (ageDays >= band.stale) return "red";
  if (ageDays >= band.aging) return "amber";
  return "green";
}
function ageInDays(lastRunDay, nowIso) {
  const last = Date.parse(`${lastRunDay}T00:00:00.000Z`);
  const now = Date.parse(nowIso);
  if (Number.isNaN(last) || Number.isNaN(now)) return void 0;
  return Math.max(0, Math.floor((now - last) / MS_PER_DAY2));
}
function buildFreshness(records, nowIso, thresholds) {
  const latestDay = /* @__PURE__ */ new Map();
  const present = /* @__PURE__ */ new Set();
  for (const entry of records) {
    const kind = logicalKindFor(entry.kind);
    if (kind === void 0) continue;
    present.add(kind);
    if (entry.at === void 0) continue;
    const day = entry.at.slice(0, 10);
    const prior = latestDay.get(kind);
    if (prior === void 0 || day > prior) latestDay.set(kind, day);
  }
  return FRESHNESS_TRACKED_KINDS.map((kind) => {
    const day = latestDay.get(kind);
    if (day === void 0) {
      return { kind, band: "unknown" };
    }
    const ageDays = ageInDays(day, nowIso);
    if (ageDays === void 0) {
      return { kind, lastRun: day, band: "unknown" };
    }
    return {
      kind,
      lastRun: day,
      ageDays,
      band: classify(ageDays, bandFor(kind, thresholds))
    };
  });
}

// src/engines/report/library-health-trend.ts
function asNumber5(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function buildLibraryHealthTrend(records) {
  const byDate = /* @__PURE__ */ new Map();
  for (const entry of records) {
    if (entry.kind !== "library-health") continue;
    if (entry.at === void 0) continue;
    const date = entry.at.slice(0, 10);
    byDate.set(date, {
      date,
      overrides: asNumber5(entry.record.overrideHotspots),
      deprecated: asNumber5(entry.record.deprecatedUsage),
      detached: asNumber5(entry.record.detachedCandidates)
    });
  }
  return [...byDate.values()].sort(
    (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
}

// src/engines/report/migration-checklist.ts
function asObject4(value2) {
  return typeof value2 === "object" && value2 !== null ? value2 : void 0;
}
function asNumber6(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function asString2(value2) {
  return typeof value2 === "string" ? value2 : "";
}
function toSite(raw) {
  return {
    file: asString2(raw.file),
    line: asNumber6(raw.line),
    subject: asString2(raw.subject),
    from: asString2(raw.from),
    to: asString2(raw.to)
  };
}
function buildMigrationChecklist(latestImpact, cap) {
  if (latestImpact === void 0) {
    return { sites: [], truncated: false };
  }
  const rawSites = Array.isArray(latestImpact.sites) ? latestImpact.sites : [];
  const recordedTruncated = latestImpact.sitesTruncated === true;
  const sites = [];
  for (const entry of rawSites) {
    const obj = asObject4(entry);
    if (obj === void 0) continue;
    sites.push(toSite(obj));
  }
  const limit = Number.isFinite(cap) && cap > 0 ? cap : sites.length;
  const overCap = sites.length > limit;
  const capped = overCap ? sites.slice(0, limit) : sites;
  return {
    sites: capped,
    truncated: overCap || recordedTruncated
  };
}

// src/engines/report/ownership.ts
var UNOWNED = "unowned";
function asNumber7(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function segments(path) {
  return path.split("/").filter((s) => s.length > 0);
}
function matchesGlob(dir, pattern) {
  const dirSegs = segments(dir);
  const patSegs = segments(pattern);
  const hasGlob = pattern.includes("*");
  let di = 0;
  let pi = 0;
  while (pi < patSegs.length) {
    const seg = patSegs[pi];
    if (seg === "**") {
      if (pi === patSegs.length - 1) return true;
      const rest = patSegs.slice(pi + 1);
      for (let start = di; start <= dirSegs.length; start += 1) {
        if (matchSuffix(dirSegs.slice(start), rest)) return true;
      }
      return false;
    }
    if (di >= dirSegs.length) return false;
    if (seg !== "*" && seg !== dirSegs[di]) return false;
    di += 1;
    pi += 1;
  }
  if (di === dirSegs.length) return true;
  return !hasGlob;
}
function matchSuffix(dirSegs, patSegs) {
  let di = 0;
  let pi = 0;
  while (pi < patSegs.length) {
    const seg = patSegs[pi];
    if (seg === "**") {
      if (pi === patSegs.length - 1) return true;
      const rest = patSegs.slice(pi + 1);
      for (let start = di; start <= dirSegs.length; start += 1) {
        if (matchSuffix(dirSegs.slice(start), rest)) return true;
      }
      return false;
    }
    if (di >= dirSegs.length) return false;
    if (seg !== "*" && seg !== dirSegs[di]) return false;
    di += 1;
    pi += 1;
  }
  return di === dirSegs.length;
}
function matchOwner(dir, ownership) {
  let owner;
  for (const rule of ownership) {
    if (rule.paths.some((pattern) => matchesGlob(dir, pattern))) {
      owner = rule.owner;
    }
  }
  return owner;
}
function pct3(refs, literals) {
  const total = refs + literals;
  return total === 0 ? 0 : Math.round(refs / total * 100);
}
function rollupByOwner(byDirectory, ownership) {
  if (byDirectory.length === 0 || ownership.length === 0) return [];
  const byOwner = /* @__PURE__ */ new Map();
  for (const bucket of byDirectory) {
    const owner = matchOwner(bucket.dir, ownership) ?? UNOWNED;
    const acc = byOwner.get(owner) ?? { refs: 0, literals: 0 };
    acc.refs += asNumber7(bucket.refs);
    acc.literals += asNumber7(bucket.literals);
    byOwner.set(owner, acc);
  }
  return [...byOwner.entries()].map(([owner, { refs, literals }]) => ({
    owner,
    refs,
    literals,
    pct: pct3(refs, literals)
  })).sort(
    (a, b) => a.pct - b.pct || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0)
  );
}
function parseCodeowners(text) {
  const rules = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const tokens = line.split(/\s+/).filter((t) => t.length > 0);
    const path = tokens[0];
    const owners = tokens.slice(1);
    if (path === void 0 || path === "" || owners.length === 0) continue;
    for (const owner of owners) {
      rules.push({ owner, paths: [path] });
    }
  }
  return rules;
}

// src/engines/report/parity-trend.ts
function asNumber8(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function clamp013(value2) {
  return Math.min(100, Math.max(0, value2));
}
function recordPct(record) {
  if (typeof record.score === "number" && Number.isFinite(record.score)) {
    return clamp013(record.score);
  }
  const total = asNumber8(record.total);
  if (total <= 0) return 0;
  return clamp013(100 * asNumber8(record.ok) / total);
}
function buildParityTrend(records) {
  const byDate = /* @__PURE__ */ new Map();
  for (const entry of records) {
    if (entry.kind !== "parity") continue;
    if (entry.at === void 0) continue;
    const date = entry.at.slice(0, 10);
    byDate.set(date, Math.round(recordPct(entry.record)));
  }
  return [...byDate.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([date, pct5]) => ({ date, pct: pct5 }));
}

// src/engines/report/scorecard.ts
var ROW_ORDER = [
  "score",
  "on-system",
  "lint-violations",
  "drift",
  "import-coverage",
  "contrast",
  "readiness"
];
function asNumber9(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function pct4(part, whole) {
  if (whole <= 0) return void 0;
  return Math.round(100 * part / whole);
}
function asRecord2(value2) {
  return typeof value2 === "object" && value2 !== null ? value2 : void 0;
}
function extractLatest(text) {
  const latest = {};
  for (const { kind, record } of replayHistory(text)) {
    switch (kind) {
      case "tokens-check":
        latest.tokensCheck = record;
        break;
      case "lint": {
        latest.lint = record;
        if (asRecord2(record.adoption) !== void 0) {
          latest.adoption = record;
        }
        break;
      }
      case "adoption":
        latest.adoptionLine = record;
        break;
      case "handoff":
        latest.handoff = record;
        break;
      case "a11y":
        latest.a11y = record;
        break;
      default:
        break;
    }
  }
  return latest;
}
function scoreFor(text, weights) {
  const outcome = scoreFromHistory(text, weights);
  if (outcome.kind === "no-data") return void 0;
  return {
    current: outcome.current,
    components: outcome.components.map((c2) => ({
      kind: c2.kind,
      score: c2.score,
      weight: c2.weight
    }))
  };
}
function onSystemPct(record) {
  const adoption = record === void 0 ? void 0 : asRecord2(record.adoption);
  if (adoption === void 0) return void 0;
  const refs = asNumber9(adoption.refs);
  const literals = asNumber9(adoption.literals);
  return pct4(refs, refs + literals);
}
function violations(record) {
  if (record === void 0) return void 0;
  const byKind = asRecord2(record.byKind) ?? {};
  return asNumber9(byKind.exact) + asNumber9(byKind.near) + asNumber9(byKind.offSystem);
}
function driftCounts(record) {
  if (record === void 0) return void 0;
  return {
    stale: asNumber9(record.stale),
    missing: asNumber9(record.missing),
    orphan: asNumber9(record.orphan)
  };
}
function coverageCounts(record) {
  if (record === void 0) return void 0;
  return { imported: asNumber9(record.imported), total: asNumber9(record.total) };
}
function contrastPct(record) {
  if (record === void 0) return void 0;
  const modes2 = Array.isArray(record.modes) ? record.modes : [];
  let passed = 0;
  let failed = 0;
  for (const m of modes2) {
    const mm = asRecord2(m);
    if (mm === void 0) continue;
    passed += asNumber9(mm.passed);
    failed += asNumber9(mm.failed);
  }
  return pct4(passed, passed + failed);
}
function readinessValue(record) {
  if (record === void 0) return void 0;
  return {
    score: asNumber9(record.score),
    frame: typeof record.frameName === "string" ? record.frameName : ""
  };
}
function scalarRow(id, now, base) {
  if (now === void 0 && base === void 0) return void 0;
  const row = { id };
  if (now !== void 0) row.now = now;
  if (base !== void 0) row.base = base;
  if (now !== void 0 && base !== void 0) row.delta = now - base;
  return row;
}
function buildScorecard(currentText, baseText, weights) {
  const currentOnly = baseText === void 0;
  const cur = extractLatest(currentText);
  const bas = baseText === void 0 ? void 0 : extractLatest(baseText);
  const rows = [];
  const nowScore = scoreFor(currentText, weights);
  const baseScore = baseText === void 0 ? void 0 : scoreFor(baseText, weights);
  if (nowScore !== void 0 || baseScore !== void 0) {
    const row = {
      id: "score",
      components: nowScore?.components ?? []
    };
    if (nowScore !== void 0) row.now = nowScore.current;
    if (baseScore !== void 0) row.base = baseScore.current;
    if (nowScore !== void 0 && baseScore !== void 0) {
      row.delta = nowScore.current - baseScore.current;
    }
    rows.push(row);
  }
  const onSystem = scalarRow(
    "on-system",
    onSystemPct(cur.adoption),
    bas === void 0 ? void 0 : onSystemPct(bas.adoption)
  );
  if (onSystem !== void 0) rows.push(onSystem);
  const lintViolations = scalarRow(
    "lint-violations",
    violations(cur.lint),
    bas === void 0 ? void 0 : violations(bas.lint)
  );
  if (lintViolations !== void 0) rows.push(lintViolations);
  const nowDrift = driftCounts(cur.tokensCheck);
  const baseDrift = bas === void 0 ? void 0 : driftCounts(bas.tokensCheck);
  if (nowDrift !== void 0 || baseDrift !== void 0) {
    const row = { id: "drift" };
    if (nowDrift !== void 0) row.now = nowDrift;
    if (baseDrift !== void 0) row.base = baseDrift;
    rows.push(row);
  }
  const nowCov = coverageCounts(cur.adoptionLine);
  const baseCov = bas === void 0 ? void 0 : coverageCounts(bas.adoptionLine);
  if (nowCov !== void 0 || baseCov !== void 0) {
    const row = { id: "import-coverage" };
    if (nowCov !== void 0) row.now = nowCov;
    if (baseCov !== void 0) row.base = baseCov;
    rows.push(row);
  }
  const contrast = scalarRow(
    "contrast",
    contrastPct(cur.a11y),
    bas === void 0 ? void 0 : contrastPct(bas.a11y)
  );
  if (contrast !== void 0) rows.push(contrast);
  const nowReady = readinessValue(cur.handoff);
  const baseReady = bas === void 0 ? void 0 : readinessValue(bas.handoff);
  if (nowReady !== void 0 || baseReady !== void 0) {
    const row = { id: "readiness" };
    if (nowReady !== void 0) row.now = nowReady;
    if (baseReady !== void 0) row.base = baseReady;
    if (nowReady !== void 0 && baseReady !== void 0) {
      row.delta = nowReady.score - baseReady.score;
    }
    rows.push(row);
  }
  if (rows.length === 0) return { kind: "no-data" };
  rows.sort((a, b) => ROW_ORDER.indexOf(a.id) - ROW_ORDER.indexOf(b.id));
  return { kind: "ok", currentOnly, rows };
}

// src/engines/report/scorecard-md.ts
var BAND_GLYPH = {
  green: "\u{1F7E2}",
  amber: "\u{1F7E1}",
  red: "\u{1F534}",
  unknown: "\u26AA"
};
var TARGET_PERCENT = /* @__PURE__ */ new Set(["on-system", "contrast"]);
var TITLE2 = "### Design-system scorecard";
var ROW_LABEL = {
  score: "System score",
  "on-system": "On-system",
  "lint-violations": "Lint violations",
  drift: "Drift (stale/missing/orphan)",
  "import-coverage": "Import coverage",
  contrast: "Contrast",
  readiness: "Readiness"
};
var MOVER_LABEL = {
  score: "score",
  "on-system": "on-system",
  "lint-violations": "lint violations",
  drift: "drift",
  "import-coverage": "import coverage",
  contrast: "contrast",
  readiness: "readiness"
};
var COMPONENT_LABEL = {
  drift: "Drift",
  lint: "Lint",
  readiness: "Readiness",
  a11y: "A11y",
  adoption: "Adoption",
  parity: "Parity"
};
function arrow2(delta) {
  if (delta > 0) return "\u25B2";
  if (delta < 0) return "\u25BC";
  return "=";
}
function signed(delta) {
  return delta > 0 ? `+${delta}` : `${delta}`;
}
function driftCell(counts, bold) {
  const text = `${counts.stale}/${counts.missing}/${counts.orphan}`;
  return bold ? `**${text}**` : text;
}
function isPercent(id) {
  return id === "on-system" || id === "contrast";
}
function scalar(id, value2) {
  return isPercent(id) ? `${value2}%` : `${value2}`;
}
function metricLabel(row) {
  if (row.id === "readiness") {
    const frame = row.now?.frame ?? row.base?.frame ?? "";
    return frame === "" ? "Readiness" : `Readiness (${frame})`;
  }
  return ROW_LABEL[row.id];
}
function hasScalarDelta(row) {
  return (row.id === "score" || row.id === "on-system" || row.id === "lint-violations" || row.id === "contrast" || row.id === "readiness") && row.delta !== void 0;
}
function nowScalar(row) {
  switch (row.id) {
    case "score":
    case "on-system":
    case "lint-violations":
    case "contrast":
      return row.now;
    case "readiness":
      return row.now?.score;
    default:
      return void 0;
  }
}
function baseScalar(row) {
  switch (row.id) {
    case "score":
    case "on-system":
    case "lint-violations":
    case "contrast":
      return row.base;
    case "readiness":
      return row.base?.score;
    default:
      return void 0;
  }
}
function moverFragment(label, id, row) {
  const now = nowScalar(row);
  const base = baseScalar(row);
  const delta = hasScalarDelta(row) ? row.delta : 0;
  return `${label} ${scalar(id, base ?? 0)} \u2192 ${scalar(id, now ?? 0)} ${arrow2(delta)}`;
}
function breakingTokenIncrease(rows) {
  const drift = rows.find((r2) => r2.id === "drift");
  if (drift === void 0 || drift.id !== "drift") return 0;
  const nowStale = drift.now?.stale ?? 0;
  const baseStale = drift.base?.stale;
  if (baseStale === void 0) return 0;
  return nowStale > baseStale ? nowStale - baseStale : 0;
}
function summaryLine(rows) {
  const scoreRow = rows.find((r2) => r2.id === "score");
  const movers = rows.filter((r2) => r2.id !== "score" && hasScalarDelta(r2));
  movers.sort((a, b) => {
    const da = hasScalarDelta(a) ? Math.abs(a.delta) : 0;
    const db = hasScalarDelta(b) ? Math.abs(b.delta) : 0;
    return db - da;
  });
  const topMover = movers[0];
  const fragments = [];
  if (scoreRow !== void 0 && scoreRow.id === "score") {
    if (scoreRow.delta !== void 0) {
      fragments.push(moverFragment("Score", "score", scoreRow));
    } else if (scoreRow.now !== void 0) {
      fragments.push(`Score ${scoreRow.now}`);
    }
    if (topMover !== void 0) {
      fragments.push(
        moverFragment(MOVER_LABEL[topMover.id], topMover.id, topMover)
      );
    }
  } else if (topMover !== void 0) {
    fragments.push(
      moverFragment(ROW_LABEL[topMover.id], topMover.id, topMover)
    );
  }
  const breaking = breakingTokenIncrease(rows);
  if (breaking > 0) {
    const noun = breaking === 1 ? "breaking token change" : "breaking token changes";
    fragments.push(`**${breaking} ${noun}**`);
  }
  return fragments.join(" \xB7 ");
}
function primaryNow(row) {
  if (row.id === "drift") return row.now?.stale;
  if (row.id === "import-coverage") return row.now?.imported;
  return nowScalar(row);
}
function currentOnlySummary(rows) {
  const scoreRow = rows.find((r2) => r2.id === "score");
  if (scoreRow !== void 0 && scoreRow.id === "score" && scoreRow.now !== void 0) {
    return `Score ${scoreRow.now}`;
  }
  for (const row of rows) {
    const now = primaryNow(row);
    if (now === void 0) continue;
    const value2 = row.id === "drift" || row.id === "import-coverage" ? `${now}` : scalar(row.id, now);
    return `${ROW_LABEL[row.id]} ${value2}`;
  }
  return "No movement";
}
function renderCompareRow(row, breaking) {
  const label = metricLabel(row);
  if (row.id === "drift") {
    const base2 = row.base !== void 0 ? driftCell(row.base, false) : "\u2014";
    const now2 = row.now !== void 0 ? driftCell(row.now, breaking) : "\u2014";
    const delta = row.now !== void 0 && row.base !== void 0 ? `${signed(row.now.stale - row.base.stale)} ${arrow2(row.now.stale - row.base.stale)}` : "\u2014";
    return `| ${label} | ${base2} | ${now2} | ${delta} |`;
  }
  if (row.id === "import-coverage") {
    const base2 = row.base !== void 0 ? `${row.base.imported}/${row.base.total}` : "\u2014";
    const now2 = row.now !== void 0 ? `${row.now.imported}/${row.now.total}` : "\u2014";
    const delta = row.now !== void 0 && row.base !== void 0 ? `${signed(row.now.imported - row.base.imported)} ${arrow2(row.now.imported - row.base.imported)}` : "\u2014";
    return `| ${label} | ${base2} | ${now2} | ${delta} |`;
  }
  const now = nowScalar(row);
  const base = baseScalar(row);
  const nowCell = now !== void 0 ? scalar(row.id, now) : "\u2014";
  const baseCell = base !== void 0 ? scalar(row.id, base) : "\u2014";
  const deltaCell = hasScalarDelta(row) ? `${signed(row.delta)} ${arrow2(row.delta)}` : "\u2014";
  return `| ${label} | ${baseCell} | ${nowCell} | ${deltaCell} |`;
}
function renderCurrentRow(row) {
  const label = metricLabel(row);
  if (row.id === "drift") {
    const now2 = row.now !== void 0 ? driftCell(row.now, false) : "\u2014";
    return `| ${label} | ${now2} |`;
  }
  if (row.id === "import-coverage") {
    const now2 = row.now !== void 0 ? `${row.now.imported}/${row.now.total}` : "\u2014";
    return `| ${label} | ${now2} |`;
  }
  const now = nowScalar(row);
  const nowCell = now !== void 0 ? scalar(row.id, now) : "\u2014";
  return `| ${label} | ${nowCell} |`;
}
function componentBlock(rows) {
  const scoreRow = rows.find((r2) => r2.id === "score");
  if (scoreRow === void 0 || scoreRow.id !== "score") return [];
  if (scoreRow.components.length === 0) return [];
  const lines = [
    "#### Components",
    "",
    "| Component | Score | Weight |",
    "| --- | --- | --- |"
  ];
  for (const c2 of scoreRow.components) {
    lines.push(
      `| ${COMPONENT_LABEL[c2.kind] ?? c2.kind} | ${c2.score} | ${c2.weight} |`
    );
  }
  return lines;
}
function scoreNow(model) {
  const row = model.rows.find((r2) => r2.id === "score");
  return row !== void 0 && row.id === "score" ? row.now : void 0;
}
function scoreDelta(model) {
  const row = model.rows.find((r2) => r2.id === "score");
  return row !== void 0 && row.id === "score" ? row.delta : void 0;
}
function targetMeasured(metric, measured) {
  if (measured === void 0) return "\u2014";
  return TARGET_PERCENT.has(metric) ? `${measured}%` : `${measured}`;
}
function targetsBlock(targets) {
  if (targets.length === 0) return [];
  const lines = [
    "### Targets",
    "",
    "| Metric | Measured | Target | Status |",
    "| --- | --- | --- | --- |"
  ];
  for (const t of targets) {
    lines.push(
      `| ${t.metric} | ${targetMeasured(t.metric, t.measured)} | ${t.op} ${t.target} | ${BAND_GLYPH[t.band]} |`
    );
  }
  return lines;
}
function ageCell(row) {
  return row.ageDays !== void 0 ? `${row.ageDays}d` : "\u2014";
}
function freshnessBlock(rows, base) {
  if (rows.length === 0) return [];
  const delta = base !== void 0;
  const header = delta ? "| Kind | Last run | Age | \u0394 age | Band |" : "| Kind | Last run | Age | Band |";
  const rule = delta ? "| --- | --- | --- | --- | --- |" : "| --- | --- | --- | --- |";
  const lines = ["### Freshness", "", header, rule];
  for (const row of rows) {
    const last = row.lastRun ?? "never";
    const age = ageCell(row);
    const band = BAND_GLYPH[row.band];
    if (!delta) {
      lines.push(`| ${row.kind} | ${last} | ${age} | ${band} |`);
      continue;
    }
    const baseRow = base?.find((b) => b.kind === row.kind);
    const d = row.ageDays !== void 0 && baseRow?.ageDays !== void 0 ? `${signed(row.ageDays - baseRow.ageDays)} ${arrow2(row.ageDays - baseRow.ageDays)}` : "\u2014";
    lines.push(`| ${row.kind} | ${last} | ${age} | ${d} | ${band} |`);
  }
  return lines;
}
function velocityBlock(velocity, now, gitRefDelta) {
  const score = now !== void 0 ? `${now}` : "\u2014";
  const window = `${signed(velocity.delta)} over ${velocity.windowDays}d`;
  const streak = `${velocity.regressionStreak}-decline streak`;
  const motion = gitRefDelta !== void 0 ? `window ${window} \xB7 git-ref ${signed(gitRefDelta)}` : window;
  return [
    "### Score velocity",
    "",
    `score ${score} \xB7 ${motion} \xB7 ${velocity.direction} \xB7 ${streak}`
  ];
}
function migrationBlock(checklist) {
  if (checklist.sites.length === 0) return [];
  const n = checklist.sites.length;
  const noun = n === 1 ? "call site" : "call sites";
  const capped = checklist.truncated ? " (capped)" : "";
  const lines = [
    "### Migration checklist",
    "",
    `${n} ${noun} to migrate${capped}.`,
    "",
    "| Site | Subject | Change |",
    "| --- | --- | --- |"
  ];
  for (const s of checklist.sites) {
    lines.push(
      `| \`${s.file}:${s.line}\` | ${s.subject} | \`${s.from}\` \u2192 \`${s.to}\` |`
    );
  }
  return lines;
}
function ownershipBlock(rows, base) {
  if (rows.length === 0) return [];
  const delta = base !== void 0;
  const header = delta ? "| Owner | On-system | Refs | Literals | \u0394 pct |" : "| Owner | On-system | Refs | Literals |";
  const rule = delta ? "| --- | --- | --- | --- | --- |" : "| --- | --- | --- | --- |";
  const lines = ["### Ownership", "", header, rule];
  for (const row of rows) {
    const cells = `${row.owner} | ${row.pct}% | ${row.refs} | ${row.literals}`;
    if (!delta) {
      lines.push(`| ${cells} |`);
      continue;
    }
    const baseRow = base?.find((b) => b.owner === row.owner);
    const d = baseRow !== void 0 ? `${signed(row.pct - baseRow.pct)} ${arrow2(row.pct - baseRow.pct)}` : "\u2014";
    lines.push(`| ${cells} | ${d} |`);
  }
  return lines;
}
function libraryHealthBlock(rows, base, baseLabel, currentLabel) {
  const now = rows[rows.length - 1];
  const was = base?.[base.length - 1];
  if (now === void 0 || was === void 0) return [];
  const row = (label, b, n) => `| ${label} | ${b} | ${n} | ${signed(n - b)} ${arrow2(n - b)} |`;
  return [
    "### Library health",
    "",
    `| Signal | ${baseLabel} | ${currentLabel} | \u0394 |`,
    "| --- | --- | --- | --- |",
    row("Override hotspots", was.overrides, now.overrides),
    row("Deprecated usage", was.deprecated, now.deprecated),
    row("Detached candidates", was.detached, now.detached)
  ];
}
function changelogBlock(changelog) {
  if (changelog.slices.length === 0) return [];
  const lines = ["### Changelog", ""];
  changelog.slices.forEach((slice, index) => {
    lines.push(
      `**For ${slice.audience}** \u2014 ${slice.breaking} breaking \xB7 ${slice.additive} additive \xB7 ${slice.cosmetic} cosmetic`
    );
    for (const item of slice.recent) lines.push(`- ${item}`);
    if (index < changelog.slices.length - 1) lines.push("");
  });
  return lines;
}
function appendixBlocks(model, options) {
  const selected = options.artifacts;
  if (selected === void 0) return [];
  const blocks = options.blocks ?? {};
  const base = options.baseBlocks;
  const has = (id) => selected.includes(id);
  const out = [];
  const add = (lines) => {
    if (lines.length > 0) out.push(...lines, "");
  };
  if (has("targets") && blocks.targets !== void 0) {
    add(targetsBlock(blocks.targets));
  }
  if (has("data-freshness") && blocks.dataFreshness !== void 0) {
    add(freshnessBlock(blocks.dataFreshness, base?.dataFreshness));
  }
  if (has("score-velocity") && blocks.scoreVelocity !== void 0) {
    add(
      velocityBlock(blocks.scoreVelocity, scoreNow(model), scoreDelta(model))
    );
  }
  if (has("migration-checklist") && blocks.migrationChecklist !== void 0) {
    add(migrationBlock(blocks.migrationChecklist));
  }
  if (has("ownership-leaderboard") && blocks.ownershipLeaderboard !== void 0) {
    add(
      ownershipBlock(blocks.ownershipLeaderboard, base?.ownershipLeaderboard)
    );
  }
  if (has("library-health-trend") && blocks.libraryHealthTrend !== void 0) {
    add(
      libraryHealthBlock(
        blocks.libraryHealthTrend,
        base?.libraryHealthTrend,
        options.baseLabel ?? "base",
        options.currentLabel ?? "current"
      )
    );
  }
  if (has("audience-changelog") && blocks.audienceChangelog !== void 0) {
    add(changelogBlock(blocks.audienceChangelog));
  }
  return out;
}
function renderScorecardMarkdown(model, options) {
  const lines = [TITLE2, ""];
  if (model.kind === "no-data") {
    lines.push(
      "_No design-system history yet \u2014 run a check to populate the scorecard._",
      ""
    );
    return lines.join("\n");
  }
  const currentLabel = options.currentLabel ?? "current";
  const compare = !model.currentOnly;
  lines.push(
    compare ? summaryLine(model.rows) : currentOnlySummary(model.rows),
    ""
  );
  const breaking = breakingTokenIncrease(model.rows) > 0;
  if (compare) {
    const baseLabel = options.baseLabel ?? "base";
    lines.push(
      `| Metric | ${baseLabel} | ${currentLabel} | \u0394 |`,
      "| --- | --- | --- | --- |"
    );
    for (const row of model.rows) lines.push(renderCompareRow(row, breaking));
  } else {
    lines.push(`| Metric | ${currentLabel} |`, "| --- | --- |");
    for (const row of model.rows) lines.push(renderCurrentRow(row));
  }
  lines.push("");
  const components = componentBlock(model.rows);
  if (components.length > 0) lines.push(...components, "");
  if (options.noBaseline === true) {
    const baseLabel = options.baseLabel ?? "base";
    lines.push(`_no baseline at ${baseLabel}_`, "");
  }
  lines.push(...appendixBlocks(model, options));
  return lines.join("\n");
}

// src/engines/report/targets.ts
function isSatisfied(measured, op, value2) {
  switch (op) {
    case ">=":
      return measured >= value2;
    case "<=":
      return measured <= value2;
    case "==":
      return measured === value2;
  }
}
function defaultMargin(value2) {
  return Math.abs(value2) * 0.1;
}
function bandFor2(measured, target) {
  const { op, value: value2, warn } = target;
  if (isSatisfied(measured, op, value2)) return "green";
  const margin = defaultMargin(value2);
  if (op === ">=") {
    const floor = warn ?? value2 - margin;
    return measured >= floor ? "amber" : "red";
  }
  if (op === "<=") {
    const ceiling = warn ?? value2 + margin;
    return measured <= ceiling ? "amber" : "red";
  }
  const halfWidth = warn ?? margin;
  return Math.abs(measured - value2) <= halfWidth ? "amber" : "red";
}
function evaluateTargets(latest, targets) {
  const verdicts = [];
  for (const [metric, target] of Object.entries(targets)) {
    const measured = latest[metric];
    const band = measured === void 0 ? "unknown" : bandFor2(measured, target);
    verdicts.push({
      metric,
      measured,
      target: target.value,
      op: target.op,
      band
    });
  }
  return verdicts;
}

// src/engines/report/velocity.ts
var MS_PER_DAY3 = 24 * 60 * 60 * 1e3;
function computeVelocity(trend, nowIso, windowDays) {
  if (trend.length < 2) return void 0;
  const latest = trend[trend.length - 1];
  if (latest === void 0) return void 0;
  const nowMs = Date.parse(nowIso);
  let windowStartDate;
  if (!Number.isNaN(nowMs)) {
    windowStartDate = new Date(nowMs - windowDays * MS_PER_DAY3).toISOString().slice(0, 10);
  }
  let baseline;
  if (windowStartDate !== void 0) {
    for (const point of trend) {
      if (point.date < windowStartDate) baseline = point;
    }
  }
  if (baseline === void 0) baseline = trend[0];
  if (baseline === void 0) return void 0;
  const delta = latest.score - baseline.score;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  let regressionStreak = 0;
  for (let i = trend.length - 1; i > 0; i -= 1) {
    const cur = trend[i];
    const prev = trend[i - 1];
    if (cur === void 0 || prev === void 0) break;
    if (cur.score < prev.score) regressionStreak += 1;
    else break;
  }
  return { delta, windowDays, direction, regressionStreak };
}

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
function escapeXml2(value2) {
  return value2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function round2(n) {
  return Number(n.toFixed(3));
}
function clamp3(value2, min, max) {
  if (value2 < min) return min;
  if (value2 > max) return max;
  return value2;
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
function donutGauge(value2, opts = {}) {
  const size = 120;
  const clamped = clamp3(value2, 0, 100);
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
var STATUS_BAND_FILL = {
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
  unknown: TRACK_COLOR
};
function statusGrid(rows, opts = {}) {
  const width = opts.width ?? 480;
  const rowH = 28;
  const height = opts.height ?? Math.max(rowH, rows.length * rowH + 8);
  if (rows.length === 0) {
    return emptyState(width, height, "Status grid (no data)");
  }
  const pad2 = { top: 4, left: 8, right: 8 };
  const pillW = 76;
  const pillX = round2(width - pad2.right - pillW);
  const measuredX = round2(width * 0.42);
  const targetX = round2(width * 0.62);
  const parts = [];
  parts.push(svgOpen(width, height));
  parts.push(
    `<title>Status grid: ${escapeXml2(rows.map((r2) => r2.label).join(", "))}</title>`
  );
  rows.forEach((row, index) => {
    const y = pad2.top + index * rowH;
    const midY = round2(y + rowH / 2 + 3);
    const fill = STATUS_BAND_FILL[row.band];
    const pillTextColor = row.band === "unknown" ? TEXT_COLOR2 : "#ffffff";
    parts.push(
      `<text x="${pad2.left}" y="${midY}" text-anchor="start" fill="${TEXT_COLOR2}" font-family="sans-serif" font-size="11" font-weight="600">${escapeXml2(row.label)}</text>`
    );
    parts.push(
      `<text x="${measuredX}" y="${midY}" text-anchor="start" fill="${TEXT_COLOR2}" font-family="sans-serif" font-size="11">${escapeXml2(row.measured)}</text>`
    );
    parts.push(
      `<text x="${targetX}" y="${midY}" text-anchor="start" fill="${AXIS_COLOR}" font-family="sans-serif" font-size="11">${escapeXml2(row.target)}</text>`
    );
    parts.push(
      `<rect class="pill" x="${pillX}" y="${round2(y + 5)}" width="${pillW}" height="${rowH - 10}" fill="${fill}" rx="9" />`
    );
    parts.push(
      `<text x="${round2(pillX + pillW / 2)}" y="${midY}" text-anchor="middle" fill="${pillTextColor}" font-family="sans-serif" font-size="10" font-weight="600">${escapeXml2(row.band)}</text>`
    );
  });
  parts.push("</svg>");
  return parts.join("");
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
function escapeHtml(value2) {
  return value2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
ul.calendar { margin: 12px 0 0; padding: 0; list-style: none; font-size: 12px; }
ul.calendar li { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-top: 1px solid var(--border); }
ul.calendar .date { font-variant-numeric: tabular-nums; color: var(--text); font-weight: 600; }
ul.calendar .detail { color: var(--text-subtle); text-align: right; }
.badge {
	display: inline-block;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 11px;
	background: var(--accent-soft);
	color: var(--accent);
	padding: 1px 6px;
	border-radius: 6px;
	margin-right: 4px;
}
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
var COMPONENT_LABEL2 = {
  drift: "drift",
  lint: "lint",
  readiness: "readiness",
  a11y: "a11y",
  adoption: "adoption",
  parity: "parity"
};
function systemScoreSection(data, weightProfile) {
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
    (c2) => `<tr><td>${escapeHtml(COMPONENT_LABEL2[c2.kind] ?? c2.kind)}</td><td class="num">${escapeHtml(String(c2.score))}</td><td class="num">${escapeHtml(String(c2.weight))}</td></tr>`
  ).join("");
  const legend = [
    '<table class="weights">',
    "<thead><tr><th>Component</th><th>Sub-score</th><th>Weight</th></tr></thead>",
    `<tbody>${legendRows}</tbody>`,
    "</table>"
  ].join("");
  const caption = weightProfile?.source === "view" && weightProfile.name !== void 0 ? `<div class="meta">weights: ${escapeHtml(weightProfile.name)} profile</div>` : "";
  return panel(
    "System score",
    [
      `<div class="chart" style="text-align:center">${donutGauge(score.current, { label: "System score" })}</div>`,
      `<div class="chart">${lineChart(trendSeries)}</div>`,
      legend,
      caption
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
function onSystemPct2(refs, literals) {
  const total = refs + literals;
  return total === 0 ? 0 : Math.round(refs / total * 100);
}
function adoptionTrendSection(data) {
  const trend = data.adoptionTrend;
  if (trend === void 0 || trend.length === 0) {
    return panel("Adoption trend", emptyState2("lint <dir>"));
  }
  const series = [
    {
      label: "on-system %",
      points: trend.map((point, index) => ({ x: index, y: point.pct }))
    }
  ];
  const dateRange = `${escapeHtml(trend[0]?.date ?? "")} \u2192 ${escapeHtml(
    trend[trend.length - 1]?.date ?? ""
  )}`;
  return panel(
    "Adoption trend",
    [
      `<div class="chart">${lineChart(series)}</div>`,
      `<div class="meta">On-system % over ${dateRange} \xB7 css/scss values only (var(--\u2026) vs literals)</div>`
    ].join("")
  );
}
function importCoverageSection(data) {
  const coverage = data.importCoverage;
  if (coverage === void 0) {
    return panel("Import coverage", emptyState2("adoption"));
  }
  const { imported, total, uncovered, uncoveredTotal } = coverage;
  const pct5 = total === 0 ? 0 : Math.round(imported / total * 100);
  const list = uncovered.length > 0 ? [
    '<ul class="offenders">',
    ...uncovered.map(
      (name) => `<li><code>${escapeHtml(name)}</code></li>`
    ),
    "</ul>"
  ].join("") : "";
  const overflow = uncoveredTotal > uncovered.length ? `<div class="meta">\u2026 and ${escapeHtml(
    String(uncoveredTotal - uncovered.length)
  )} more</div>` : "";
  return panel(
    "Import coverage",
    [
      `<div class="chart" style="text-align:center">${donutGauge(pct5, { label: "Import coverage" })}</div>`,
      `<div class="meta">${escapeHtml(String(imported))}/${escapeHtml(String(total))} registry components imported \xB7 resolved .tsx imports only (a floor)</div>`,
      list,
      overflow
    ].join("")
  );
}
function leaderboardSection(data) {
  const rows = data.leaderboard;
  if (rows === void 0 || rows.length === 0) {
    return panel("Adoption leaderboard", emptyState2("lint <dir>"));
  }
  const bars = rows.map((row) => ({
    label: row.dir,
    value: onSystemPct2(row.refs, row.literals)
  }));
  const labels = [
    '<ul class="offenders">',
    ...rows.map(
      (row) => `<li><code>${escapeHtml(row.dir)}</code><span class="count">${escapeHtml(
        String(onSystemPct2(row.refs, row.literals))
      )}%</span></li>`
    ),
    "</ul>"
  ].join("");
  return panel(
    "Adoption leaderboard",
    [
      `<div class="meta">On-system % by directory, worst-first \xB7 css/scss values only</div>`,
      `<div class="chart">${barChart(bars, { color: "#dc2626" })}</div>`,
      labels
    ].join("")
  );
}
function libraryHealthSection(data) {
  const health = data.libraryHealth;
  if (health === void 0) {
    return panel("Library health", emptyState2("library-health"));
  }
  const { totals } = health;
  const bars = [
    { label: "Override hotspots", value: totals.overrideHotspots },
    { label: "Deprecated usage", value: totals.deprecatedUsage },
    { label: "Detached candidates", value: totals.detachedCandidates }
  ];
  const detachedCaveat = [
    '<div class="meta">',
    `Detached candidates: ${escapeHtml(String(totals.detachedCandidates))} `,
    "\u2014 heuristic \u2014 REST cannot truly detect detachment; expect false positives.",
    "</div>"
  ].join("");
  const hotspots = health.overrideHotspots.length > 0 ? [
    '<ul class="offenders">',
    ...health.overrideHotspots.map(
      (h) => `<li><code>${escapeHtml(h.name)}</code><span class="count">${escapeHtml(String(h.overrideCount))}</span></li>`
    ),
    "</ul>"
  ].join("") : "";
  return panel(
    "Library health",
    [
      `<div class="chart">${barChart(bars)}</div>`,
      detachedCaveat,
      hotspots
    ].join("")
  );
}
var BREAKING_SOURCE_LABEL = {
  tokens: "tokens",
  figma: "figma"
};
function breakingCalendarSection(data) {
  const calendar = data.breakingCalendar;
  if (calendar === void 0 || calendar.entries.length === 0) {
    return panel("Breaking calendar", emptyState2("tokens-check"));
  }
  const rows = calendar.entries.map((entry) => {
    const badge2 = `<span class="badge">${escapeHtml(
      BREAKING_SOURCE_LABEL[entry.source]
    )}</span>`;
    const detail = entry.detail ?? `${entry.count}`;
    return `<li><span class="date">${escapeHtml(entry.date)}</span><span class="detail">${badge2} ${escapeHtml(detail)}</span></li>`;
  }).join("");
  return panel(
    "Breaking calendar",
    [
      `<div class="meta">${escapeHtml(String(calendar.total))} breaking event${calendar.total === 1 ? "" : "s"}, most-recent first</div>`,
      `<ul class="calendar">${rows}</ul>`
    ].join("")
  );
}
function changeFrequencySection(data) {
  const frequency = data.changeFrequency;
  if (frequency === void 0 || frequency.byKind.length === 0) {
    return panel("Change frequency", emptyState2("tokens-check"));
  }
  const bars = frequency.byKind.map((bucket) => ({
    label: bucket.kind,
    value: bucket.count
  }));
  const window = frequency.windowFirst !== void 0 && frequency.windowLast !== void 0 ? `<div class="meta">Records per kind \xB7 ${escapeHtml(frequency.windowFirst)} \u2192 ${escapeHtml(frequency.windowLast)}</div>` : '<div class="meta">Records per kind</div>';
  return panel(
    "Change frequency",
    [window, `<div class="chart">${barChart(bars)}</div>`].join("")
  );
}
function targetsSection(data) {
  const targets = data.targets;
  if (targets === void 0 || targets.length === 0) {
    return panel("Targets / SLAs", emptyState2("report"));
  }
  const rows = targets.map((verdict) => ({
    label: COMPONENT_LABEL2[verdict.metric] ?? verdict.metric,
    measured: verdict.measured === void 0 ? "\u2014" : String(verdict.measured),
    target: `${verdict.op} ${verdict.target}`,
    band: verdict.band
  }));
  const legendRows = ["green", "amber", "red", "unknown"].map(
    (band) => `<tr><td>${escapeHtml(band)}</td><td>${escapeHtml(
      band === "green" ? "meets target" : band === "amber" ? "near target" : band === "red" ? "misses target" : "not measured"
    )}</td></tr>`
  ).join("");
  const legend = [
    '<table class="weights">',
    "<thead><tr><th>Band</th><th>Meaning</th></tr></thead>",
    `<tbody>${legendRows}</tbody>`,
    "</table>"
  ].join("");
  return panel(
    "Targets / SLAs",
    [`<div class="chart">${statusGrid(rows)}</div>`, legend].join("")
  );
}
function parityTrendSection(data) {
  const trend = data.parityTrend;
  if (trend === void 0 || trend.length === 0) {
    return panel("Parity trend", emptyState2("registry build"));
  }
  const series = [
    {
      label: "parity %",
      points: trend.map((point, index) => ({ x: index, y: point.pct }))
    }
  ];
  const dateRange = `${escapeHtml(trend[0]?.date ?? "")} \u2192 ${escapeHtml(
    trend[trend.length - 1]?.date ?? ""
  )}`;
  return panel(
    "Parity trend",
    [
      `<div class="chart">${lineChart(series)}</div>`,
      `<div class="meta">Component parity pass-% over ${dateRange}</div>`
    ].join("")
  );
}
function componentHealthSection(data) {
  const rows = data.componentHealth;
  if (rows === void 0 || rows.length === 0) {
    return panel("Component health", emptyState2("registry build"));
  }
  const bars = rows.map((row) => ({
    label: row.component,
    value: row.healthScore
  }));
  const offenders = rows.slice(0, 5);
  const list = [
    '<ul class="offenders">',
    ...offenders.map((row) => {
      const issues = row.issues.length > 0 ? row.issues.join(", ") : "no issues";
      return `<li><code>${escapeHtml(row.component)}</code><span class="count">${escapeHtml(String(row.healthScore))} \xB7 ${escapeHtml(issues)}</span></li>`;
    }),
    "</ul>"
  ].join("");
  return panel(
    "Component health",
    [
      '<div class="meta">Composite health per component, worst-first</div>',
      `<div class="chart">${barChart(bars, { color: "#dc2626" })}</div>`,
      list
    ].join("")
  );
}
function libraryHealthTrendSection(data) {
  const trend = data.libraryHealthTrend;
  if (trend === void 0 || trend.length === 0) {
    return panel("Library health trend", emptyState2("library-health"));
  }
  const toSeries = (label, pick) => ({
    label,
    points: trend.map((point, index) => ({ x: index, y: pick(point) }))
  });
  const series = [
    toSeries("overrides", (p4) => p4.overrides),
    toSeries("deprecated", (p4) => p4.deprecated),
    toSeries("detached", (p4) => p4.detached)
  ];
  const dateRange = `${escapeHtml(trend[0]?.date ?? "")} \u2192 ${escapeHtml(
    trend[trend.length - 1]?.date ?? ""
  )}`;
  return panel(
    "Library health trend",
    [
      `<div class="chart">${lineChart(series)}</div>`,
      `<div class="cols"><b>Overrides</b> \xB7 <b>Deprecated</b> \xB7 <b>Detached</b> over ${dateRange}</div>`
    ].join("")
  );
}
function migrationChecklistSection(data) {
  const checklist = data.migrationChecklist;
  if (checklist === void 0 || checklist.sites.length === 0) {
    return panel("Migration checklist", emptyState2("impact --checklist"));
  }
  const rows = checklist.sites.map((site) => {
    const where = `${site.file}:${site.line}`;
    const detail = `${escapeHtml(site.subject)} \xB7 ${escapeHtml(site.from)} \u2192 ${escapeHtml(site.to)}`;
    return `<li><code>${escapeHtml(where)}</code><span class="detail">${detail}</span></li>`;
  }).join("");
  const overflow = checklist.truncated ? '<div class="meta">\u2026 and more sites beyond the cap</div>' : "";
  return panel(
    "Migration checklist",
    [
      `<div class="meta">${escapeHtml(String(checklist.sites.length))} call site${checklist.sites.length === 1 ? "" : "s"} to migrate \xB7 file:line \xB7 subject \xB7 from \u2192 to</div>`,
      `<ul class="calendar">${rows}</ul>`,
      overflow
    ].join("")
  );
}
function scoreVelocitySection(data) {
  const velocity = data.scoreVelocity;
  if (velocity === void 0) {
    return panel("Score velocity", emptyState2("report"));
  }
  const { delta, windowDays, direction, regressionStreak } = velocity;
  const ARROW = {
    up: "\u25B2",
    down: "\u25BC",
    flat: "\u25AC"
  };
  const arrow3 = ARROW[direction];
  const signedDelta = delta > 0 ? `+${delta}` : delta < 0 ? `\u2212${Math.abs(delta)}` : "0";
  const streakBadge = regressionStreak > 0 ? `<span class="badge">${escapeHtml(String(regressionStreak))} regression${regressionStreak === 1 ? "" : "s"}</span>` : "";
  return panel(
    "Score velocity",
    [
      `<div class="cols"><b>${escapeHtml(arrow3)} ${escapeHtml(signedDelta)}</b> over ${escapeHtml(String(windowDays))} day${windowDays === 1 ? "" : "s"}</div>`,
      `<div class="meta">${escapeHtml(direction)} \xB7 regression streak ${streakBadge}${regressionStreak === 0 ? escapeHtml("0") : ""}</div>`
    ].join("")
  );
}
function ownershipLeaderboardSection(data) {
  const rows = data.ownershipLeaderboard;
  if (rows === void 0 || rows.length === 0) {
    return panel("Ownership leaderboard", emptyState2("lint"));
  }
  const bars = rows.map((row) => ({
    label: row.owner,
    value: row.pct
  }));
  const labels = [
    '<ul class="offenders">',
    ...rows.map(
      (row) => `<li><code>${escapeHtml(row.owner)}</code><span class="count">${escapeHtml(
        String(row.pct)
      )}% \xB7 ${escapeHtml(String(row.refs))} refs / ${escapeHtml(
        String(row.literals)
      )} literals</span></li>`
    ),
    "</ul>"
  ].join("");
  return panel(
    "Ownership leaderboard",
    [
      `<div class="meta">On-system % by owner, worst-first \xB7 css/scss values only</div>`,
      `<div class="chart">${barChart(bars, { color: "#dc2626" })}</div>`,
      labels
    ].join("")
  );
}
function audienceChangelogSection(data) {
  const changelog = data.audienceChangelog;
  if (changelog === void 0 || changelog.slices.length === 0) {
    return panel("Changelog by audience", emptyState2("ds-changelog"));
  }
  const columns = changelog.slices.map((slice) => {
    const badges = [
      `<span class="badge">breaking ${escapeHtml(String(slice.breaking))}</span>`,
      `<span class="badge">additive ${escapeHtml(String(slice.additive))}</span>`,
      `<span class="badge">cosmetic ${escapeHtml(String(slice.cosmetic))}</span>`
    ].join("");
    const recent = slice.recent.length > 0 ? [
      '<ul class="offenders">',
      ...slice.recent.map(
        (entry) => `<li><code>${escapeHtml(entry)}</code></li>`
      ),
      "</ul>"
    ].join("") : '<div class="meta">No recent entries</div>';
    return [
      '<div class="audience-col">',
      `<div class="cols"><b>${escapeHtml(slice.audience)}</b></div>`,
      `<div class="meta">${badges}</div>`,
      recent,
      "</div>"
    ].join("");
  }).join("");
  return panel("Changelog by audience", `<div class="cols">${columns}</div>`);
}
function frameImplementabilitySection(data) {
  const frame = data.frameImplementability;
  if (frame === void 0) {
    return panel("Frame implementability", emptyState2("frame-impl"));
  }
  const { pct: pct5, resolved, total, gaps } = frame;
  const gapList = gaps.length > 0 ? [
    '<ul class="offenders">',
    ...gaps.map(
      (gap) => `<li><code>${escapeHtml(gap.reason)}</code><span class="count">${escapeHtml(String(gap.count))}</span></li>`
    ),
    "</ul>"
  ].join("") : "";
  return panel(
    "Frame implementability",
    [
      `<div class="chart" style="text-align:center">${donutGauge(pct5, { label: "Frame implementability" })}</div>`,
      `<div class="meta">${escapeHtml(String(resolved))}/${escapeHtml(String(total))} requirements resolve to the system</div>`,
      gapList
    ].join("")
  );
}
function releaseReadinessSection(data) {
  const readiness = data.releaseReadiness;
  if (readiness === void 0 || readiness.checks.length === 0) {
    return panel("Release readiness", emptyState2("release-check"));
  }
  const GO_FILL = "#16a34a";
  const NO_GO_FILL = "#dc2626";
  const headerFill = readiness.go ? GO_FILL : NO_GO_FILL;
  const headerText = readiness.go ? "GO" : "NO-GO";
  const header = `<div class="meta"><span class="badge" style="background:${headerFill};color:#ffffff">${escapeHtml(headerText)}</span></div>`;
  const items = readiness.checks.map((check) => {
    const mark = check.pass ? "\u2713" : "\u2717";
    const markFill = check.pass ? GO_FILL : NO_GO_FILL;
    const detail = check.detail !== void 0 && check.detail.length > 0 ? `<span class="detail">${escapeHtml(check.detail)}</span>` : "";
    return `<li><span class="date" style="color:${markFill}">${mark}</span><span class="detail">${escapeHtml(check.name)}</span>${detail}</li>`;
  }).join("");
  return panel(
    "Release readiness",
    [header, `<ul class="calendar">${items}</ul>`].join("")
  );
}
function dataFreshnessSection(data) {
  const rows = data.dataFreshness;
  if (rows === void 0 || rows.length === 0) {
    return panel("Data freshness", emptyState2("report"));
  }
  const BAND_FILL = {
    green: "#16a34a",
    amber: "#d97706",
    red: "#dc2626",
    unknown: "#57606a"
  };
  const ageLabel = (row) => {
    if (row.ageDays === void 0) return "never";
    if (row.ageDays === 0) return "today";
    return `${row.ageDays}d ago`;
  };
  const items = rows.map((row) => {
    const fill = BAND_FILL[row.band];
    const pill = `<span class="badge" style="background:${fill};color:#ffffff">${escapeHtml(row.band)}</span>`;
    const age = escapeHtml(ageLabel(row));
    return `<li><span class="date">${escapeHtml(row.kind)}</span><span class="detail">${pill} ${age}</span></li>`;
  }).join("");
  return panel(
    "Data freshness",
    [
      '<div class="meta">Measurement age per check-kind \xB7 band signals trust</div>',
      `<ul class="calendar">${items}</ul>`
    ].join("")
  );
}
var SECTION_RENDERERS = {
  "system-score": systemScoreSection,
  "drift-trend": driftSection,
  "lint-summary": lintSection,
  readiness: readinessSection,
  parity: paritySection,
  a11y: a11ySection,
  impact: impactSection,
  "adoption-trend": adoptionTrendSection,
  "import-coverage": importCoverageSection,
  leaderboard: leaderboardSection,
  "library-health": libraryHealthSection,
  "breaking-calendar": breakingCalendarSection,
  "change-frequency": changeFrequencySection,
  // Persona-wave metric sections (C1–C13). Real chart/list renderers (M4.1 +
  // M4.2); the completeness gate (24 artifacts) holds via the Record type.
  targets: targetsSection,
  "parity-trend": parityTrendSection,
  "component-health": componentHealthSection,
  "library-health-trend": libraryHealthTrendSection,
  "migration-checklist": migrationChecklistSection,
  "score-velocity": scoreVelocitySection,
  "ownership-leaderboard": ownershipLeaderboardSection,
  "audience-changelog": audienceChangelogSection,
  "frame-implementability": frameImplementabilitySection,
  "release-readiness": releaseReadinessSection,
  "data-freshness": dataFreshnessSection
};
function renderDashboard(data, selection = ALL_ARTIFACT_IDS, options = {}) {
  const project = escapeHtml(data.project);
  const generatedAt = escapeHtml(data.generatedAt);
  const viewLabel = options.viewLabel === void 0 ? "" : `<span class="view">${escapeHtml(options.viewLabel)}</span>`;
  const sections = selection.map(
    (id) => id === "system-score" ? systemScoreSection(data, options.weightProfile) : SECTION_RENDERERS[id](data)
  );
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

// src/render/html/index.ts
function renderIndex(entries) {
  const cards = entries.length > 0 ? entries.map(
    (entry) => [
      '<section class="panel">',
      `<h2><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.name)}</a></h2>`,
      "</section>"
    ].join("")
  ).join("") : [
    '<section class="panel">',
    '<div class="empty">',
    '<span class="empty-title">No dashboards published</span>',
    "<span>Configure <code>publish</code> or pass <code>--dashboards</code>.</span>",
    "</div>",
    "</section>"
  ].join("");
  const body = [
    '<div class="wrap">',
    '<header class="dash">',
    "<h1>ds-bridge dashboards</h1>",
    "</header>",
    '<div class="grid">',
    cards,
    "</div>",
    "</div>"
  ].join("");
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>ds-bridge dashboards</title>",
    `<style>${STYLE}</style>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

// src/render/terminal/dashboard.ts
function emptyState3(command) {
  return `No data yet \u2014 run \`ds-bridge ${command}\` to populate this section.`;
}
function panel2(title, body) {
  return `${title}
${"\u2500".repeat([...title].length)}
${body}`;
}
function systemScoreTerminalSection(data, color) {
  const score = data.systemScore;
  if (score === void 0) {
    return panel2("System score", emptyState3("report"));
  }
  const COMPONENT_LABEL3 = {
    drift: "drift",
    lint: "lint",
    readiness: "readiness",
    a11y: "a11y",
    adoption: "adoption",
    parity: "parity"
  };
  const gauge = renderGauge(score.current, {
    label: "System score",
    width: 24,
    color
  });
  const trend = sparkline(score.trend.map((point) => point.score));
  const legend = renderTable(
    ["Component", "Sub-score", "Weight"],
    score.components.map((c2) => [
      COMPONENT_LABEL3[c2.kind] ?? c2.kind,
      String(c2.score),
      String(c2.weight)
    ]),
    { color }
  );
  return panel2("System score", [gauge, trend, legend].join("\n"));
}
function driftTrendTerminalSection(data, _color) {
  const trend = data.driftTrend;
  if (trend === void 0 || trend.length === 0) {
    return panel2("Drift trend", emptyState3("diff --since <ref>"));
  }
  const breaking = sparkline(trend.map((point) => point.breaking));
  const additive = sparkline(trend.map((point) => point.additive));
  const cosmetic = sparkline(trend.map((point) => point.cosmetic));
  const dateRange = trend.length > 0 ? `${trend[0]?.date ?? ""} \u2192 ${trend[trend.length - 1]?.date ?? ""}` : "";
  return panel2(
    "Drift trend",
    [
      `Breaking ${breaking}`,
      `Additive ${additive}`,
      `Cosmetic ${cosmetic}`,
      `Breaking \xB7 Additive \xB7 Cosmetic over ${dateRange}`
    ].join("\n")
  );
}
function lintSummaryTerminalSection(data, color) {
  const lint = data.lintSummary;
  if (lint === void 0) {
    return panel2("Lint violations", emptyState3("ds-lint"));
  }
  const bars = renderBarChart(
    [
      { label: "Exact", value: lint.byKind.exact },
      { label: "Near", value: lint.byKind.near },
      { label: "Off-system", value: lint.byKind.offSystem }
    ],
    { width: 24, color }
  );
  const offenders = lint.topOffenders.length > 0 ? lint.topOffenders.map((o) => `${o.file}  ${o.count}`).join("\n") : "";
  const body = offenders === "" ? bars : `${bars}
${offenders}`;
  return panel2("Lint violations", body);
}
function readinessTerminalSection(data, color) {
  const readiness = data.readiness;
  if (readiness === void 0) {
    return panel2("Readiness", emptyState3("qa <frame>"));
  }
  const gauge = renderGauge(readiness.score, {
    label: "Readiness",
    width: 24,
    color
  });
  const deductions = readiness.deductions.length > 0 ? readiness.deductions.map((d) => `${d.reason}  -${d.points}`).join("\n") : "";
  const lines = [gauge, readiness.frameName];
  if (deductions !== "") {
    lines.push(deductions);
  }
  return panel2("Readiness", lines.join("\n"));
}
function parityTerminalSection(data, color) {
  const parity = data.parity;
  if (parity === void 0 || parity.rows.length === 0) {
    return panel2("Parity matrix", emptyState3("parity"));
  }
  const STATUS_CELL = {
    ok: "ok",
    "prop-mismatch": "warn",
    "missing-in-code": "fail",
    "missing-in-figma": "fail"
  };
  const rows = parity.rows.map((row) => ({
    label: row.component,
    cells: row.cells.map((cell) => STATUS_CELL[cell.status])
  }));
  const body = [renderMatrix(rows, parity.columns, { color })];
  if (parity.columns.length > 0) {
    body.push(`Columns: ${parity.columns.join(" \xB7 ")}`);
  }
  return panel2("Parity matrix", body.join("\n"));
}
function a11yTerminalSection(data, color) {
  const a11y = data.a11y;
  if (a11y === void 0 || a11y.modes.length === 0) {
    return panel2("Contrast (a11y)", emptyState3("a11y"));
  }
  const bars = a11y.modes.map((m) => ({
    label: m.mode,
    value: m.failed
  }));
  const tallies = a11y.modes.map(
    (m) => `${m.mode}  ${m.passed} passed \xB7 ${m.failed} failed`
  );
  const body = [
    `Failures by mode \xB7 level ${a11y.level}`,
    renderBarChart(bars, { width: 24, color }),
    ...tallies
  ].join("\n");
  return panel2("Contrast (a11y)", body);
}
function impactTerminalSection(data, color) {
  const impact = data.impact;
  if (impact === void 0) {
    return panel2("Change impact", emptyState3("impact"));
  }
  const bars = [
    { label: "Breaking", value: impact.breaking },
    { label: "Additive", value: impact.additive },
    { label: "Cosmetic", value: impact.cosmetic }
  ];
  const sites = impact.touchedCallSites;
  const radius = `Touches ${sites} call site${sites === 1 ? "" : "s"}`;
  const body = [renderBarChart(bars, { width: 24, color }), radius].join("\n");
  return panel2("Change impact", body);
}
function adoptionTrendTerminalSection(data, _color) {
  const trend = data.adoptionTrend;
  if (trend === void 0 || trend.length === 0) {
    return panel2("Adoption trend", emptyState3("lint <dir>"));
  }
  const spark = sparkline(trend.map((point) => point.pct));
  const dateRange = `${trend[0]?.date ?? ""} \u2192 ${trend[trend.length - 1]?.date ?? ""}`;
  const body = [
    `on-system %  ${spark}`,
    `On-system % over ${dateRange} \xB7 css/scss values only (var(--\u2026) vs literals)`
  ].join("\n");
  return panel2("Adoption trend", body);
}
function importCoverageTerminalSection(data, color) {
  const coverage = data.importCoverage;
  if (coverage === void 0) {
    return panel2("Import coverage", emptyState3("adoption"));
  }
  const { imported, total, uncovered, uncoveredTotal } = coverage;
  const pct5 = total === 0 ? 0 : Math.round(imported / total * 100);
  const lines = [];
  lines.push(renderGauge(pct5, { label: "Import coverage", width: 24, color }));
  lines.push(
    `${imported}/${total} registry components imported \xB7 resolved .tsx imports only (a floor)`
  );
  if (uncovered.length > 0) {
    for (const name of uncovered) {
      lines.push(`\u2022 ${name}`);
    }
  }
  if (uncoveredTotal > uncovered.length) {
    lines.push(`\u2026 and ${uncoveredTotal - uncovered.length} more`);
  }
  return panel2("Import coverage", lines.join("\n"));
}
function leaderboardTerminalSection(data, color) {
  const rows = data.leaderboard;
  if (rows === void 0 || rows.length === 0) {
    return panel2("Adoption leaderboard", emptyState3("lint <dir>"));
  }
  const onSystemPct4 = (refs, literals) => {
    const total = refs + literals;
    return total === 0 ? 0 : Math.round(refs / total * 100);
  };
  const bars = rows.map((row) => ({
    label: row.dir,
    value: onSystemPct4(row.refs, row.literals)
  }));
  const lines = [];
  lines.push("On-system % by directory, worst-first \xB7 css/scss values only");
  lines.push(renderBarChart(bars, { width: 24, color }));
  return panel2("Adoption leaderboard", lines.join("\n"));
}
function libraryHealthTerminalSection(data, color) {
  const health = data.libraryHealth;
  if (health === void 0) {
    return panel2("Library health", emptyState3("library-health"));
  }
  const { totals } = health;
  const bars = [
    { label: "Override hotspots", value: totals.overrideHotspots },
    { label: "Deprecated usage", value: totals.deprecatedUsage },
    { label: "Detached candidates", value: totals.detachedCandidates }
  ];
  const lines = [];
  lines.push(renderBarChart(bars, { width: 24, color }));
  lines.push(
    `Detached candidates: ${totals.detachedCandidates} \u2014 heuristic \u2014 REST cannot truly detect detachment; expect false positives.`
  );
  if (health.overrideHotspots.length > 0) {
    for (const h of health.overrideHotspots) {
      lines.push(`\u2022 ${h.name} (${h.overrideCount})`);
    }
  }
  return panel2("Library health", lines.join("\n"));
}
function breakingCalendarTerminalSection(data, color) {
  const calendar = data.breakingCalendar;
  if (calendar === void 0 || calendar.entries.length === 0) {
    return panel2("Breaking calendar", emptyState3("tokens-check"));
  }
  const BREAKING_SOURCE_LABEL2 = {
    tokens: "tokens",
    figma: "figma"
  };
  const rows = calendar.entries.map((entry) => {
    const detail = entry.detail ?? `${entry.count}`;
    return [entry.date, BREAKING_SOURCE_LABEL2[entry.source], detail];
  });
  const lines = [];
  lines.push(
    `${calendar.total} breaking event${calendar.total === 1 ? "" : "s"}, most-recent first`
  );
  lines.push(renderTable(["Date", "Source", "Detail"], rows, { color }));
  return panel2("Breaking calendar", lines.join("\n"));
}
function changeFrequencyTerminalSection(data, color) {
  const frequency = data.changeFrequency;
  if (frequency === void 0 || frequency.byKind.length === 0) {
    return panel2("Change frequency", emptyState3("tokens-check"));
  }
  const items = frequency.byKind.map((bucket) => ({
    label: bucket.kind,
    value: bucket.count
  }));
  const window = frequency.windowFirst !== void 0 && frequency.windowLast !== void 0 ? `Records per kind \xB7 ${frequency.windowFirst} \u2192 ${frequency.windowLast}` : "Records per kind";
  const body = [window, renderBarChart(items, { width: 24, color })].join("\n");
  return panel2("Change frequency", body);
}
function targetsTerminalSection(data, color) {
  const targets = data.targets;
  if (targets === void 0 || targets.length === 0) {
    return panel2("Targets / SLAs", emptyState3("report"));
  }
  const COMPONENT_LABEL3 = {
    drift: "drift",
    lint: "lint",
    readiness: "readiness",
    a11y: "a11y",
    adoption: "adoption",
    parity: "parity"
  };
  const bandLevel = (band) => band === "green" ? "ok" : band === "amber" ? "warn" : band === "red" ? "error" : "info";
  const rows = targets.map((verdict) => [
    COMPONENT_LABEL3[verdict.metric] ?? verdict.metric,
    verdict.measured === void 0 ? "\u2014" : String(verdict.measured),
    `${verdict.op} ${verdict.target}`,
    severityColor(bandLevel(verdict.band), verdict.band, { color })
  ]);
  const table = renderTable(["Metric", "Measured", "Target", "Status"], rows, {
    color
  });
  const legend = [
    "green = meets target",
    "amber = near target",
    "red = misses target",
    "unknown = not measured"
  ].join("  \xB7  ");
  return panel2("Targets / SLAs", [table, legend].join("\n"));
}
function parityTrendTerminalSection(data, _color) {
  const trend = data.parityTrend;
  if (trend === void 0 || trend.length === 0) {
    return panel2("Parity trend", emptyState3("registry build"));
  }
  const values = trend.map((point) => point.pct);
  const dateRange = `${trend[0]?.date ?? ""} \u2192 ${trend[trend.length - 1]?.date ?? ""}`;
  const body = [
    `parity %  ${sparkline(values)}`,
    `Component parity pass-% over ${dateRange}`
  ].join("\n");
  return panel2("Parity trend", body);
}
function componentHealthTerminalSection(data, color) {
  const rows = data.componentHealth;
  if (rows === void 0 || rows.length === 0) {
    return panel2("Component health", emptyState3("registry build"));
  }
  const tableRows = rows.map((row) => [
    row.component,
    String(row.healthScore),
    row.issues.length > 0 ? row.issues.join(", ") : "no issues"
  ]);
  const table = renderTable(["Component", "Health", "Issues"], tableRows, {
    color
  });
  const body = ["Composite health per component, worst-first", table].join(
    "\n"
  );
  return panel2("Component health", body);
}
function libraryHealthTrendTerminalSection(data, _color) {
  const trend = data.libraryHealthTrend;
  if (trend === void 0 || trend.length === 0) {
    return panel2("Library health trend", emptyState3("library-health"));
  }
  const overrides = sparkline(trend.map((p4) => p4.overrides));
  const deprecated = sparkline(trend.map((p4) => p4.deprecated));
  const detached = sparkline(trend.map((p4) => p4.detached));
  const dateRange = `${trend[0]?.date ?? ""} \u2192 ${trend[trend.length - 1]?.date ?? ""}`;
  const detachedCaveat = "Detached: \u2014 heuristic \u2014 REST cannot truly detect detachment; expect false positives.";
  const body = [
    `Overrides  ${overrides}`,
    `Deprecated ${deprecated}`,
    `Detached   ${detached}`,
    `over ${dateRange}`,
    detachedCaveat
  ].join("\n");
  return panel2("Library health trend", body);
}
function migrationChecklistTerminalSection(data, color) {
  const checklist = data.migrationChecklist;
  if (checklist === void 0 || checklist.sites.length === 0) {
    return panel2("Migration checklist", emptyState3("impact --checklist"));
  }
  const headers = ["site", "subject", "from \u2192 to"];
  const rows = checklist.sites.map((site) => [
    `${site.file}:${site.line}`,
    site.subject,
    `${site.from} \u2192 ${site.to}`
  ]);
  const count = checklist.sites.length;
  const meta = `${count} call site${count === 1 ? "" : "s"} to migrate \xB7 file:line \xB7 subject \xB7 from \u2192 to`;
  const overflow = checklist.truncated ? "\u2026 and more sites beyond the cap" : "";
  const mapUsageCaveat = "mapUsage scans resolved .tsx imports only, so the number is a floor.";
  const body = [
    meta,
    renderTable(headers, rows, { color }),
    ...overflow !== "" ? [overflow] : [],
    mapUsageCaveat
  ].join("\n");
  return panel2("Migration checklist", body);
}
function scoreVelocityTerminalSection(data, color) {
  const velocity = data.scoreVelocity;
  if (velocity === void 0) {
    return panel2("Score velocity", emptyState3("report"));
  }
  const { delta, windowDays, direction, regressionStreak } = velocity;
  const ARROW = {
    up: "\u25B2",
    down: "\u25BC",
    flat: "\u25AC"
  };
  const arrow3 = ARROW[direction];
  const signedDelta = delta > 0 ? `+${delta}` : delta < 0 ? `\u2212${Math.abs(delta)}` : "0";
  const streakText = regressionStreak > 0 ? severityColor("warn", `${regressionStreak}-decline streak`, { color }) : "0-decline streak";
  const headline = `${arrow3} ${signedDelta} over ${windowDays} day${windowDays === 1 ? "" : "s"}`;
  const body = [headline, `${direction} \xB7 ${streakText}`].join("\n");
  return panel2("Score velocity", body);
}
function ownershipLeaderboardTerminalSection(data, color) {
  const rows = data.ownershipLeaderboard;
  if (rows === void 0 || rows.length === 0) {
    return panel2("Ownership leaderboard", emptyState3("lint"));
  }
  const bars = rows.map((row) => ({ label: row.owner, value: row.pct }));
  const labels = rows.map(
    (row) => `${row.owner}: ${row.pct}% \xB7 ${row.refs} refs / ${row.literals} literals`
  ).join("\n");
  const body = [
    "On-system % by owner, worst-first \xB7 css/scss values only",
    renderBarChart(bars, { width: 24, color }),
    labels
  ].join("\n");
  return panel2("Ownership leaderboard", body);
}
function audienceChangelogTerminalSection(data, color) {
  const changelog = data.audienceChangelog;
  if (changelog === void 0 || changelog.slices.length === 0) {
    return panel2("Changelog by audience", emptyState3("ds-changelog"));
  }
  const headers = ["audience", "breaking", "additive", "cosmetic", "recent"];
  const rows = changelog.slices.map((slice) => [
    slice.audience,
    String(slice.breaking),
    String(slice.additive),
    String(slice.cosmetic),
    slice.recent.length > 0 ? slice.recent.join(", ") : "No recent entries"
  ]);
  return panel2("Changelog by audience", renderTable(headers, rows, { color }));
}
function frameImplementabilityTerminalSection(data, color) {
  const frame = data.frameImplementability;
  if (frame === void 0) {
    return panel2("Frame implementability", emptyState3("frame-impl"));
  }
  const { pct: pct5, resolved, total, gaps } = frame;
  const gauge = renderGauge(pct5, {
    label: "Frame implementability",
    width: 24,
    color
  });
  const meta = `${resolved}/${total} requirements resolve to the system`;
  const body = [gauge, meta];
  if (gaps.length > 0) {
    body.push(
      renderBarChart(
        gaps.map((gap) => ({ label: gap.reason, value: gap.count })),
        { width: 24, color }
      )
    );
  }
  return panel2("Frame implementability", body.join("\n"));
}
function releaseReadinessTerminalSection(data, color) {
  const readiness = data.releaseReadiness;
  if (readiness === void 0 || readiness.checks.length === 0) {
    return panel2("Release readiness", emptyState3("release-check"));
  }
  const verdict = readiness.go ? severityColor("ok", "GO", { color }) : severityColor("error", "NO-GO", { color });
  const headers = ["check", "pass", "detail"];
  const rows = readiness.checks.map((check) => [
    check.name,
    check.pass ? severityColor("ok", "\u2713", { color }) : severityColor("error", "\u2717", { color }),
    check.detail !== void 0 && check.detail.length > 0 ? check.detail : ""
  ]);
  return panel2(
    "Release readiness",
    [verdict, renderTable(headers, rows, { color })].join("\n")
  );
}
function dataFreshnessTerminalSection(data, color) {
  const rows = data.dataFreshness;
  if (rows === void 0 || rows.length === 0) {
    return panel2("Data freshness", emptyState3("report"));
  }
  const BAND_SEVERITY = {
    green: "ok",
    amber: "warn",
    red: "error",
    unknown: "info"
  };
  const ageLabel = (row) => {
    if (row.ageDays === void 0) return "never";
    if (row.ageDays === 0) return "today";
    return `${row.ageDays}d ago`;
  };
  const headers = ["kind", "lastRun", "age", "band"];
  const tableRows = rows.map((row) => [
    row.kind,
    row.lastRun ?? "never",
    ageLabel(row),
    severityColor(BAND_SEVERITY[row.band], row.band, { color })
  ]);
  return panel2(
    "Data freshness",
    [
      "Measurement age per check-kind \xB7 band signals trust",
      renderTable(headers, tableRows, { color })
    ].join("\n")
  );
}
var SECTION_RENDERERS_TERMINAL = {
  "system-score": systemScoreTerminalSection,
  "drift-trend": driftTrendTerminalSection,
  "lint-summary": lintSummaryTerminalSection,
  readiness: readinessTerminalSection,
  parity: parityTerminalSection,
  a11y: a11yTerminalSection,
  impact: impactTerminalSection,
  "adoption-trend": adoptionTrendTerminalSection,
  "import-coverage": importCoverageTerminalSection,
  leaderboard: leaderboardTerminalSection,
  "library-health": libraryHealthTerminalSection,
  "breaking-calendar": breakingCalendarTerminalSection,
  "change-frequency": changeFrequencyTerminalSection,
  targets: targetsTerminalSection,
  "parity-trend": parityTrendTerminalSection,
  "component-health": componentHealthTerminalSection,
  "library-health-trend": libraryHealthTrendTerminalSection,
  "migration-checklist": migrationChecklistTerminalSection,
  "score-velocity": scoreVelocityTerminalSection,
  "ownership-leaderboard": ownershipLeaderboardTerminalSection,
  "audience-changelog": audienceChangelogTerminalSection,
  "frame-implementability": frameImplementabilityTerminalSection,
  "release-readiness": releaseReadinessTerminalSection,
  "data-freshness": dataFreshnessTerminalSection
};
function renderTerminalDashboard(data, selection, opts) {
  const headerLines = [`ds-bridge report \xB7 ${data.project}`];
  if (opts.viewLabel !== void 0) headerLines.push(`View: ${opts.viewLabel}`);
  headerLines.push(`Generated ${opts.generatedAt}`);
  const header = headerLines.join("\n");
  const sections = selection.map(
    (id) => SECTION_RENDERERS_TERMINAL[id](data, opts.color)
  );
  return [header, ...sections].join("\n\n");
}

// src/cli-commands/report.ts
var RULE_REASON = {
  "var-binding": "Variable binding",
  "auto-layout": "Auto layout",
  component: "Component usage",
  naming: "Naming"
};
function asNumber10(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) ? value2 : 0;
}
function onSystemPct3(refs, literals) {
  const total = refs + literals;
  return total === 0 ? 0 : Math.round(refs / total * 100);
}
function aggregateHistory(stateDir, onWarning) {
  const historyPath = join22(stateDir, "history.jsonl");
  let text;
  try {
    text = readFileSync19(historyPath, "utf8");
  } catch {
    return {
      driftTrend: [],
      lintSummary: void 0,
      readiness: void 0,
      a11y: void 0,
      impact: void 0,
      adoptionTrend: [],
      leaderboard: void 0,
      importCoverage: void 0,
      libraryHealth: void 0
    };
  }
  const driftTrend = [];
  let lint;
  let readiness;
  let a11y;
  let impact;
  const adoptionTrend = [];
  let leaderboard;
  let importCoverage;
  let libraryHealth;
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
        breaking: asNumber10(r2.stale),
        additive: asNumber10(r2.missing),
        cosmetic: asNumber10(r2.orphan)
      });
      continue;
    }
    if (record.kind === "lint") {
      const r2 = record;
      const byKind = r2.byKind ?? { exact: 0, near: 0, offSystem: 0 };
      lint = {
        byKind: {
          exact: asNumber10(byKind.exact),
          near: asNumber10(byKind.near),
          offSystem: asNumber10(byKind.offSystem)
        },
        topOffenders: []
      };
      const adoption = typeof r2.adoption === "object" && r2.adoption !== null ? r2.adoption : void 0;
      if (adoption !== void 0) {
        const refs = asNumber10(adoption.refs);
        const literals = asNumber10(adoption.literals);
        if (typeof r2.at === "string") {
          adoptionTrend.push({
            date: r2.at.slice(0, 10),
            pct: onSystemPct3(refs, literals)
          });
        }
        const byDirectory = Array.isArray(adoption.byDirectory) ? adoption.byDirectory : [];
        leaderboard = byDirectory.map((d) => ({
          dir: typeof d.dir === "string" ? d.dir : "",
          refs: asNumber10(d.refs),
          literals: asNumber10(d.literals)
        }));
      }
      continue;
    }
    if (record.kind === "adoption") {
      const r2 = record;
      const imported = asNumber10(r2.imported);
      const total = asNumber10(r2.total);
      const uncovered = Array.isArray(r2.uncovered) ? r2.uncovered.filter((n) => typeof n === "string") : [];
      importCoverage = {
        imported,
        total,
        uncovered,
        uncoveredTotal: Math.max(0, total - imported)
      };
      continue;
    }
    if (record.kind === "handoff") {
      const r2 = record;
      const deductions = Array.isArray(r2.deductions) ? r2.deductions : [];
      readiness = {
        score: asNumber10(r2.score),
        frameName: typeof r2.frameName === "string" ? r2.frameName : "",
        deductions: deductions.map((d) => ({
          reason: RULE_REASON[d.rule] ?? d.rule,
          points: asNumber10(d.points)
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
          passed: asNumber10(m.passed),
          failed: asNumber10(m.failed)
        }))
      };
      continue;
    }
    if (record.kind === "impact") {
      const r2 = record;
      impact = {
        breaking: asNumber10(r2.breaking),
        additive: asNumber10(r2.additive),
        cosmetic: asNumber10(r2.cosmetic),
        touchedCallSites: asNumber10(r2.touchedCallSites)
      };
      continue;
    }
    if (record.kind === "library-health") {
      const r2 = record;
      libraryHealth = {
        overrideHotspots: [],
        deprecatedUsage: [],
        detachedCandidates: [],
        totals: {
          overrideHotspots: asNumber10(r2.overrideHotspots),
          deprecatedUsage: asNumber10(r2.deprecatedUsage),
          detachedCandidates: asNumber10(r2.detachedCandidates)
        }
      };
    }
  }
  return {
    driftTrend,
    lintSummary: lint,
    readiness,
    a11y,
    impact,
    adoptionTrend,
    leaderboard,
    importCoverage,
    libraryHealth
  };
}
function computeSystemScore(stateDir, weights) {
  const historyPath = join22(stateDir, "history.jsonl");
  let text;
  try {
    text = readFileSync19(historyPath, "utf8");
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
function computeConsumerArtifacts(stateDir) {
  const records = replayHistory(readHistoryText3(stateDir));
  return {
    breakingCalendar: buildBreakingCalendar(records),
    changeFrequency: buildChangeFrequency(records)
  };
}
function computeParityTrend(stateDir) {
  return buildParityTrend(replayHistory(readHistoryText3(stateDir)));
}
function computeLibraryHealthTrend(stateDir) {
  return buildLibraryHealthTrend(replayHistory(readHistoryText3(stateDir)));
}
var VELOCITY_WINDOW = /^(\d+)([dw])$/;
function parseVelocityWindow(raw) {
  if (raw === void 0) return { kind: "ok", days: void 0 };
  const match = VELOCITY_WINDOW.exec(raw);
  if (match === null) {
    return {
      kind: "error",
      message: `Invalid --velocity-window "${raw}". Expected a relative window "<N>d" or "<N>w".`
    };
  }
  const count = Number.parseInt(match[1] ?? "", 10);
  if (count <= 0) {
    return {
      kind: "error",
      message: `Invalid --velocity-window "${raw}". The count must be a positive integer.`
    };
  }
  return { kind: "ok", days: match[2] === "w" ? count * 7 : count };
}
function computeScoreVelocity(trend, nowIso, windowDays) {
  return computeVelocity(trend, nowIso, windowDays);
}
function computeMigrationChecklist(stateDir, cap) {
  const records = replayHistory(readHistoryText3(stateDir));
  let latestImpact;
  for (const entry of records) {
    if (entry.kind === "impact") latestImpact = entry.record;
  }
  return buildMigrationChecklist(latestImpact, cap);
}
function computeAudienceChangelog(stateDir) {
  const records = replayHistory(readHistoryText3(stateDir));
  let latestChangelog;
  for (const entry of records) {
    if (entry.kind === "changelog") latestChangelog = entry.record;
  }
  return buildAudienceChangelog(latestChangelog);
}
function computeFrameImplementability(stateDir) {
  const records = replayHistory(readHistoryText3(stateDir));
  let latestFrameImpl;
  for (const entry of records) {
    if (entry.kind === "frame-impl") latestFrameImpl = entry.record;
  }
  return buildFrameImplementability(latestFrameImpl);
}
function resolveOwnership(targetDir, ownership, ownershipFile) {
  if (ownership !== void 0) return ownership;
  if (ownershipFile === void 0) return void 0;
  let text;
  try {
    text = readFileSync19(resolve11(targetDir, ownershipFile), "utf8");
  } catch {
    return void 0;
  }
  return parseCodeowners(text);
}
function byDirectoryFromRecords(records) {
  let byDirectory = [];
  for (const { kind, record } of records) {
    if (kind !== "lint") continue;
    const adoption = asRecord3(record.adoption);
    if (adoption === void 0) continue;
    const raw = Array.isArray(adoption.byDirectory) ? adoption.byDirectory : [];
    byDirectory = raw.map((entry) => {
      const dirRec = asRecord3(entry) ?? {};
      return {
        dir: typeof dirRec.dir === "string" ? dirRec.dir : "",
        refs: asNumber10(dirRec.refs),
        literals: asNumber10(dirRec.literals)
      };
    });
  }
  return byDirectory;
}
function computeOwnershipLeaderboard(stateDir, ownership) {
  if (ownership === void 0) return [];
  const records = replayHistory(readHistoryText3(stateDir));
  return rollupByOwner(byDirectoryFromRecords(records), ownership);
}
function computeReleaseReadiness(stateDir) {
  const signals = extractReleaseSignals(
    replayHistory(readHistoryText3(stateDir))
  );
  if (signals.impact === void 0 && signals.drift === void 0 && signals.parity === void 0) {
    return { go: false, checks: [] };
  }
  return evaluateReleaseReadiness(signals);
}
function computeDataFreshness(stateDir, nowIso, thresholds) {
  return buildFreshness(
    replayHistory(readHistoryText3(stateDir)),
    nowIso,
    thresholds
  );
}
function readParityRows(stateDir) {
  const registryPath = join22(stateDir, "registry.json");
  let text;
  try {
    text = readFileSync19(registryPath, "utf8");
  } catch {
    return [];
  }
  let registry;
  try {
    registry = JSON.parse(text);
  } catch {
    return [];
  }
  return buildParity(registry).rows;
}
function computeComponentHealth(stateDir, readiness, a11y, aliases) {
  return buildComponentHealth({
    parityRows: readParityRows(stateDir),
    ...readiness !== void 0 ? {
      readiness: {
        frameName: readiness.frameName,
        score: readiness.score
      }
    } : {},
    ...a11y !== void 0 ? { a11y: { modes: a11y.modes } } : {},
    ...aliases !== void 0 ? { aliases } : {}
  });
}
function asRecord3(value2) {
  return typeof value2 === "object" && value2 !== null ? value2 : void 0;
}
function safePct(part, whole) {
  if (whole <= 0) return void 0;
  return Math.round(100 * part / whole);
}
function latestTargetScalars(stateDir, systemScore) {
  const records = replayHistory(readHistoryText3(stateDir));
  let adoptionLint;
  let tokensCheck;
  let parity;
  let a11y;
  let handoff;
  for (const { kind, record } of records) {
    switch (kind) {
      case "lint":
        if (asRecord3(record.adoption) !== void 0) adoptionLint = record;
        break;
      case "tokens-check":
        tokensCheck = record;
        break;
      case "parity":
        parity = record;
        break;
      case "a11y":
        a11y = record;
        break;
      case "handoff":
        handoff = record;
        break;
      default:
        break;
    }
  }
  const scalars = {};
  const adoption = adoptionLint && asRecord3(adoptionLint.adoption);
  if (adoption !== void 0) {
    const refs = asNumber10(adoption.refs);
    const literals = asNumber10(adoption.literals);
    const pct5 = safePct(refs, refs + literals);
    if (pct5 !== void 0) scalars["on-system"] = pct5;
  }
  if (tokensCheck !== void 0) {
    scalars.drift = asNumber10(tokensCheck.stale) + asNumber10(tokensCheck.missing) + asNumber10(tokensCheck.orphan);
  }
  if (parity !== void 0) {
    const total = asNumber10(parity.total);
    if (typeof parity.score === "number" && Number.isFinite(parity.score)) {
      scalars.parity = parity.score;
    } else if (total > 0) {
      scalars.parity = Math.round(100 * asNumber10(parity.ok) / total);
    }
  }
  if (a11y !== void 0) {
    const modes2 = Array.isArray(a11y.modes) ? a11y.modes : [];
    let passed = 0;
    let failed = 0;
    for (const m of modes2) {
      const mm = asRecord3(m);
      if (mm === void 0) continue;
      passed += asNumber10(mm.passed);
      failed += asNumber10(mm.failed);
    }
    const pct5 = safePct(passed, passed + failed);
    if (pct5 !== void 0) scalars.contrast = pct5;
  }
  if (handoff !== void 0) scalars.readiness = asNumber10(handoff.score);
  if (systemScore !== void 0) scalars["system-score"] = systemScore;
  return scalars;
}
function computeTargets(stateDir, targets, systemScore) {
  if (targets === void 0) return [];
  return evaluateTargets(latestTargetScalars(stateDir, systemScore), targets);
}
function readParity(stateDir, onWarning) {
  const registryPath = join22(stateDir, "registry.json");
  let text;
  try {
    text = readFileSync19(registryPath, "utf8");
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
    mkdirSync14(dirname8(outPath), { recursive: true });
    writeFileSync10(outPath, html, "utf8");
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
function resolveDashboardSelection(targetDir, name, ctx) {
  const read = readDashboardFile(targetDir, name);
  if (read.kind === "not-found") {
    const names = listDashboards(targetDir).map((e4) => e4.name);
    const available = names.length > 0 ? ` Available: ${names.join(", ")}.` : " No saved dashboards in dashboards/.";
    return {
      kind: "error",
      message: `Unknown dashboard "${name}".${available}`
    };
  }
  if (read.kind === "invalid") {
    return {
      kind: "error",
      message: `Dashboard "${name}" is invalid: ${read.message}`
    };
  }
  const sel = read.dashboard.selection;
  const outcome = resolveView(
    sel.kind === "view" ? { view: sel.view } : { artifacts: sel.artifacts },
    {}
  );
  if (outcome.kind === "unknown-view") {
    const hint = outcome.suggestions.length > 0 ? ` \u2014 did you mean ${outcome.suggestions.join(", ")}?` : "";
    return {
      kind: "error",
      message: `Dashboard "${name}" pins an unknown view "${outcome.view}"${hint}`
    };
  }
  if (outcome.kind === "unknown-artifact") {
    return {
      kind: "error",
      message: `Dashboard "${name}" has an unknown artifact id "${outcome.id}".`
    };
  }
  if (outcome.kind === "conflicting-selection") {
    return {
      kind: "error",
      message: `Dashboard "${name}" sets both view and artifacts.`
    };
  }
  for (const notice of outcome.notices) process.stderr.write(`${notice}
`);
  const dashWeights = read.dashboard.scoreWeights;
  const validated = dashWeights !== void 0 ? validateWeights(dashWeights) : void 0;
  const effectiveWeights = validated?.kind === "ok" ? validated.weights : ctx.scoreWeights;
  const effectiveByView = dashWeights !== void 0 ? void 0 : ctx.scoreWeightsByView;
  const viewName = sel.kind === "view" ? sel.view : void 0;
  return {
    artifacts: outcome.artifacts,
    migrationSitesCap: ctx.migrationSitesCap,
    scoreVelocityWindow: ctx.scoreVelocityWindow,
    viewLabel: read.dashboard.name,
    ...read.dashboard.reportType !== void 0 ? { reportType: read.dashboard.reportType } : {},
    ...viewName !== void 0 ? { viewName } : {},
    ...effectiveWeights !== void 0 ? { scoreWeights: effectiveWeights } : {},
    ...effectiveByView !== void 0 ? { scoreWeightsByView: effectiveByView } : {},
    ...ctx.metricTargets !== void 0 ? { metricTargets: ctx.metricTargets } : {},
    ...ctx.freshnessThresholds !== void 0 ? { freshnessThresholds: ctx.freshnessThresholds } : {},
    ...ctx.componentAliases !== void 0 ? { componentAliases: ctx.componentAliases } : {},
    ...ctx.ownership !== void 0 ? { ownership: ctx.ownership } : {},
    ...ctx.ownershipFile !== void 0 ? { ownershipFile: ctx.ownershipFile } : {}
  };
}
function resolveSelection(targetDir, options) {
  let dashboardView;
  let dashboardArtifacts;
  let dashboardDefault;
  let scoreWeights;
  let scoreWeightsByView;
  let metricTargets;
  let freshnessThresholds;
  let componentAliases;
  let ownership;
  let ownershipFile;
  const defaults = resolveConfig({});
  let migrationSitesCap = defaults.kind === "ok" ? defaults.config.migrationSitesCap : 200;
  let scoreVelocityWindow = defaults.kind === "ok" ? defaults.config.scoreVelocityWindow : 30;
  const configPath = join22(targetDir, ".ds-bridge.json");
  if (existsSync17(configPath)) {
    let projectFileText;
    try {
      projectFileText = readFileSync19(configPath, "utf8");
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
    dashboardDefault = resolved.config.dashboardDefault;
    scoreWeights = resolved.config.scoreWeights;
    scoreWeightsByView = resolved.config.scoreWeightsByView;
    migrationSitesCap = resolved.config.migrationSitesCap;
    metricTargets = resolved.config.metricTargets;
    scoreVelocityWindow = resolved.config.scoreVelocityWindow;
    freshnessThresholds = resolved.config.freshnessThresholds;
    componentAliases = resolved.config.componentAliases;
    ownership = resolved.config.ownership;
    ownershipFile = resolved.config.ownershipFile;
  }
  const flagArtifacts = parseArtifactsFlag(options.artifacts);
  const activeDashboard = options.dashboard ?? dashboardDefault;
  if (activeDashboard !== void 0) {
    if (options.dashboard !== void 0 && (options.view !== void 0 || flagArtifacts !== void 0)) {
      return {
        kind: "error",
        message: "--dashboard is mutually exclusive with --view/--artifacts \u2014 pass one."
      };
    }
    return resolveDashboardSelection(targetDir, activeDashboard, {
      migrationSitesCap,
      scoreVelocityWindow,
      scoreWeights,
      scoreWeightsByView,
      metricTargets,
      freshnessThresholds,
      componentAliases,
      ownership,
      ownershipFile
    });
  }
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
      const viewName = outcome.source === "default" ? void 0 : outcome.viewName;
      return {
        artifacts: outcome.artifacts,
        migrationSitesCap,
        scoreVelocityWindow,
        ...viewLabel !== void 0 ? { viewLabel } : {},
        ...viewName !== void 0 ? { viewName } : {},
        ...scoreWeights !== void 0 ? { scoreWeights } : {},
        ...scoreWeightsByView !== void 0 ? { scoreWeightsByView } : {},
        ...metricTargets !== void 0 ? { metricTargets } : {},
        ...freshnessThresholds !== void 0 ? { freshnessThresholds } : {},
        ...componentAliases !== void 0 ? { componentAliases } : {},
        ...ownership !== void 0 ? { ownership } : {},
        ...ownershipFile !== void 0 ? { ownershipFile } : {}
      };
    }
  }
}
function readHistoryText3(stateDir) {
  try {
    return readFileSync19(join22(stateDir, "history.jsonl"), "utf8");
  } catch {
    return "";
  }
}
function runMarkdownReport(targetDir, options, selection) {
  const weightProfile = resolveWeightProfile(
    selection.viewName,
    selection.scoreWeights,
    selection.scoreWeightsByView
  );
  const stateDir = join22(targetDir, ".ds-bridge");
  const currentText = readHistoryText3(stateDir);
  let baseText;
  let noBaseline = false;
  const baseLabel = options.delta;
  if (options.delta !== void 0) {
    const outcome = readFileAtRef({
      ref: options.delta,
      path: join22(".ds-bridge", "history.jsonl"),
      cwd: targetDir,
      exec: spawnGitExec
    });
    if (outcome.kind === "git-error") {
      failReport(`Could not read "${options.delta}": ${outcome.message}`);
      return;
    }
    if (outcome.kind === "missing") {
      noBaseline = true;
    } else {
      baseText = outcome.text;
    }
  }
  const effectiveWeights = weightProfile.weights;
  const model = buildScorecard(currentText, baseText, effectiveWeights);
  if (model.kind === "no-data") {
    failReport(
      "No design-system history yet \u2014 run a check (e.g. ds-bridge tokens-check) to populate the scorecard."
    );
    return;
  }
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const systemScore = computeSystemScore(stateDir, effectiveWeights);
  const parsedWindow = parseVelocityWindow(options.velocityWindow);
  const velocityWindowDays = (parsedWindow.kind === "ok" ? parsedWindow.days : void 0) ?? selection.scoreVelocityWindow;
  const ownership = resolveOwnership(
    targetDir,
    selection.ownership,
    selection.ownershipFile
  );
  const blocks = {};
  const targets = computeTargets(
    stateDir,
    selection.metricTargets,
    systemScore?.current
  );
  if (targets.length > 0) blocks.targets = targets;
  const dataFreshness = computeDataFreshness(
    stateDir,
    generatedAt,
    selection.freshnessThresholds
  );
  if (dataFreshness.length > 0) blocks.dataFreshness = dataFreshness;
  const scoreVelocity = systemScore !== void 0 ? computeScoreVelocity(systemScore.trend, generatedAt, velocityWindowDays) : void 0;
  if (scoreVelocity !== void 0) blocks.scoreVelocity = scoreVelocity;
  const ownershipLeaderboard = computeOwnershipLeaderboard(stateDir, ownership);
  if (ownershipLeaderboard.length > 0) {
    blocks.ownershipLeaderboard = ownershipLeaderboard;
  }
  const migrationChecklist = computeMigrationChecklist(
    stateDir,
    selection.migrationSitesCap
  );
  if (migrationChecklist.sites.length > 0) {
    blocks.migrationChecklist = migrationChecklist;
  }
  const libraryHealthTrend = computeLibraryHealthTrend(stateDir);
  if (libraryHealthTrend.length > 0)
    blocks.libraryHealthTrend = libraryHealthTrend;
  const audienceChangelog = computeAudienceChangelog(stateDir);
  if (audienceChangelog.slices.length > 0) {
    blocks.audienceChangelog = audienceChangelog;
  }
  let baseBlocks;
  if (baseText !== void 0) {
    const baseRecords = replayHistory(baseText);
    const b = {};
    const baseFreshness = buildFreshness(
      baseRecords,
      generatedAt,
      selection.freshnessThresholds
    );
    if (baseFreshness.length > 0) b.dataFreshness = baseFreshness;
    const baseLht = buildLibraryHealthTrend(baseRecords);
    if (baseLht.length > 0) b.libraryHealthTrend = baseLht;
    if (ownership !== void 0) {
      const baseOwners = rollupByOwner(
        byDirectoryFromRecords(baseRecords),
        ownership
      );
      if (baseOwners.length > 0) b.ownershipLeaderboard = baseOwners;
    }
    baseBlocks = b;
  }
  const markdown = renderScorecardMarkdown(model, {
    ...baseLabel !== void 0 ? { baseLabel } : {},
    ...noBaseline ? { noBaseline: true } : {},
    artifacts: selection.artifacts,
    blocks,
    ...baseBlocks !== void 0 ? { baseBlocks } : {}
  });
  if (options.out !== void 0) {
    const outPath = resolve11(options.out);
    const written = writeDashboard(outPath, markdown);
    if (written.kind === "error") {
      failReport(written.message);
      return;
    }
    process.stdout.write(`${outPath}
`);
  } else {
    process.stdout.write(markdown);
  }
  if (options.gate) {
    const score = scoreFromHistory(currentText, effectiveWeights);
    const verdicts = computeTargets(
      stateDir,
      selection.metricTargets,
      score.kind === "ok" ? score.current : void 0
    );
    if (verdicts.some((v) => v.band === "red")) {
      process.exitCode = 1;
      return;
    }
  }
  process.exitCode = 0;
}
function readPublishConfig(targetDir) {
  const configPath = join22(targetDir, ".ds-bridge.json");
  if (!existsSync17(configPath)) return void 0;
  try {
    const projectFileText = readFileSync19(configPath, "utf8");
    const resolved = resolveConfig({ projectFileText });
    return resolved.kind === "ok" ? resolved.config.publish : void 0;
  } catch {
    return void 0;
  }
}
function resolvePublishNames(targetDir, options) {
  if (options.dashboards !== void 0) {
    return options.dashboards.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  if (options.allDashboards === true) {
    return listDashboards(targetDir).filter((e4) => e4.hasShared).map((e4) => e4.name);
  }
  return readPublishConfig(targetDir) ?? [];
}
function runSiteReport(targetDir, options, selection, data, weightProfile) {
  const stateDir = join22(targetDir, ".ds-bridge");
  const outDir = options.out !== void 0 ? resolve11(options.out) : join22(stateDir, "reports");
  const names = resolvePublishNames(targetDir, options);
  const entries = [];
  const writePage = (name, html) => {
    const written = writeDashboard(join22(outDir, `${name}.html`), html);
    if (written.kind === "error") {
      failReport(written.message);
      return false;
    }
    entries.push({ name, href: `./${name}.html` });
    return true;
  };
  if (names.length === 0) {
    const name = selection.viewLabel ?? "dashboard";
    const html = renderDashboard(data, selection.artifacts, {
      viewLabel: name,
      weightProfile: {
        source: weightProfile.source,
        ...weightProfile.name !== void 0 ? { name: weightProfile.name } : {}
      }
    });
    if (!writePage(name, html)) return;
  } else {
    for (const name of names) {
      const read = readDashboardFile(targetDir, name);
      if (read.kind === "not-found") {
        failReport(`Unknown dashboard "${name}" in the publish set.`);
        return;
      }
      if (read.kind === "invalid") {
        failReport(`Dashboard "${name}" is invalid: ${read.message}`);
        return;
      }
      const sel = read.dashboard.selection;
      const outcome = resolveView(
        sel.kind === "view" ? { view: sel.view } : { artifacts: sel.artifacts },
        {}
      );
      if (outcome.kind !== "ok") {
        failReport(`Dashboard "${name}" has an unresolvable selection.`);
        return;
      }
      const html = renderDashboard(data, outcome.artifacts, {
        viewLabel: name
      });
      if (!writePage(name, html)) return;
    }
  }
  const indexWritten = writeDashboard(
    join22(outDir, "index.html"),
    renderIndex(entries)
  );
  if (indexWritten.kind === "error") {
    failReport(indexWritten.message);
    return;
  }
  process.stdout.write(`${outDir}
`);
  process.exitCode = 0;
}
function runReport(path, options) {
  if (options.format !== void 0 && options.format !== "html" && options.format !== "md" && options.format !== "terminal" && options.format !== "site") {
    failReport(
      `Unknown --format "${options.format}". Expected "html", "md", "terminal", or "site".`
    );
    return;
  }
  const velocityWindowFlag = parseVelocityWindow(options.velocityWindow);
  if (velocityWindowFlag.kind === "error") {
    failReport(velocityWindowFlag.message);
    return;
  }
  const targetDir = resolve11(path);
  if (!existsSync17(targetDir) || !statSync10(targetDir).isDirectory()) {
    failReport(`Path "${targetDir}" is not a directory.`);
    return;
  }
  const selection = resolveSelection(targetDir, options);
  if ("kind" in selection) {
    failReport(selection.message);
    return;
  }
  const format = options.format ?? selection.reportType ?? "html";
  if (format !== "html" && format !== "md" && format !== "terminal" && format !== "site") {
    failReport(
      `report_type "${format}" is not a supported render target \u2014 pass --format html|md|terminal|site.`
    );
    return;
  }
  if (options.delta !== void 0 && format !== "md") {
    failReport("--delta requires --format md.");
    return;
  }
  if (options.open && format !== "html") {
    failReport(
      `--open is not valid with --format ${format} (there is no file to open).`
    );
    return;
  }
  if (options.gate && format !== "md") {
    failReport(
      "--gate requires --format md (the gate acts on the text scorecard, not the HTML dashboard)."
    );
    return;
  }
  if (format === "md") {
    runMarkdownReport(targetDir, options, selection);
    return;
  }
  const stateDir = join22(targetDir, ".ds-bridge");
  const warn = (message) => {
    process.stderr.write(`${message}
`);
  };
  const aggregation = aggregateHistory(stateDir, warn);
  const parity = readParity(stateDir, warn);
  const weightProfile = resolveWeightProfile(
    selection.viewName,
    selection.scoreWeights,
    selection.scoreWeightsByView
  );
  const systemScore = computeSystemScore(stateDir, weightProfile.weights);
  const consumer = computeConsumerArtifacts(stateDir);
  const parityTrend = computeParityTrend(stateDir);
  const migrationChecklist = computeMigrationChecklist(
    stateDir,
    selection.migrationSitesCap
  );
  const audienceChangelog = computeAudienceChangelog(stateDir);
  const frameImplementability = computeFrameImplementability(stateDir);
  const targets = computeTargets(
    stateDir,
    selection.metricTargets,
    systemScore?.current
  );
  const libraryHealthTrend = computeLibraryHealthTrend(stateDir);
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const velocityWindowDays = velocityWindowFlag.days ?? selection.scoreVelocityWindow;
  const scoreVelocity = systemScore !== void 0 ? computeScoreVelocity(systemScore.trend, generatedAt, velocityWindowDays) : void 0;
  const dataFreshness = computeDataFreshness(
    stateDir,
    generatedAt,
    selection.freshnessThresholds
  );
  const componentHealth = computeComponentHealth(
    stateDir,
    aggregation.readiness,
    aggregation.a11y,
    selection.componentAliases
  );
  const ownershipLeaderboard = computeOwnershipLeaderboard(
    stateDir,
    resolveOwnership(targetDir, selection.ownership, selection.ownershipFile)
  );
  const releaseReadiness = computeReleaseReadiness(stateDir);
  const data = {
    generatedAt,
    project: basename(targetDir),
    ...systemScore !== void 0 ? { systemScore } : {},
    driftTrend: aggregation.driftTrend,
    ...aggregation.lintSummary !== void 0 ? { lintSummary: aggregation.lintSummary } : {},
    ...aggregation.readiness !== void 0 ? { readiness: aggregation.readiness } : {},
    ...parity !== void 0 ? { parity } : {},
    ...aggregation.a11y !== void 0 ? { a11y: aggregation.a11y } : {},
    ...aggregation.impact !== void 0 ? { impact: aggregation.impact } : {},
    adoptionTrend: aggregation.adoptionTrend,
    ...aggregation.leaderboard !== void 0 ? { leaderboard: aggregation.leaderboard } : {},
    ...aggregation.importCoverage !== void 0 ? { importCoverage: aggregation.importCoverage } : {},
    ...aggregation.libraryHealth !== void 0 ? { libraryHealth: aggregation.libraryHealth } : {},
    breakingCalendar: consumer.breakingCalendar,
    changeFrequency: consumer.changeFrequency,
    ...parityTrend.length > 0 ? { parityTrend } : {},
    ...migrationChecklist.sites.length > 0 ? { migrationChecklist } : {},
    ...audienceChangelog.slices.length > 0 ? { audienceChangelog } : {},
    ...frameImplementability.total > 0 ? { frameImplementability } : {},
    ...targets.length > 0 ? { targets } : {},
    ...libraryHealthTrend.length > 0 ? { libraryHealthTrend } : {},
    ...scoreVelocity !== void 0 ? { scoreVelocity } : {},
    ...dataFreshness.length > 0 ? { dataFreshness } : {},
    ...componentHealth.length > 0 ? { componentHealth } : {},
    ...ownershipLeaderboard.length > 0 ? { ownershipLeaderboard } : {},
    ...releaseReadiness.checks.length > 0 ? { releaseReadiness } : {}
  };
  if (format === "site") {
    runSiteReport(targetDir, options, selection, data, weightProfile);
    return;
  }
  if (format === "terminal") {
    const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
    const text = renderTerminalDashboard(data, selection.artifacts, {
      generatedAt,
      color,
      ...selection.viewLabel !== void 0 ? { viewLabel: selection.viewLabel } : {}
    });
    if (options.out !== void 0) {
      const outPath2 = resolve11(options.out);
      const written2 = writeDashboard(outPath2, text);
      if (written2.kind === "error") {
        failReport(written2.message);
        return;
      }
      process.stdout.write(`${outPath2}
`);
    } else {
      process.stdout.write(`${text}
`);
    }
    process.exitCode = 0;
    return;
  }
  const html = renderDashboard(data, selection.artifacts, {
    ...selection.viewLabel !== void 0 ? { viewLabel: selection.viewLabel } : {},
    // Caption the system-score section ONLY for a `view`-source profile; the
    // renderer renders nothing for project/default (golden-neutral).
    weightProfile: {
      source: weightProfile.source,
      ...weightProfile.name !== void 0 ? { name: weightProfile.name } : {}
    }
  });
  const outPath = options.out !== void 0 ? resolve11(options.out) : join22(stateDir, "reports", "dashboard.html");
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
    "--format <format>",
    "output format: html (default, the offline dashboard) | md (a markdown scorecard for PR comments / $GITHUB_STEP_SUMMARY). A saved --dashboard's report_type defaults it."
  ).option(
    "--delta <ref>",
    "compare against the base ref's committed history (requires --format md)"
  ).option(
    "--gate",
    "exit 1 when a metric_targets verdict is red (requires --format md; CI gate, C1)",
    false
  ).option(
    "--velocity-window <window>",
    "score-velocity look-back window as <N>d|<N>w (C8; overrides score_velocity_window, default 30d)"
  ).option(
    "--dashboard <name>",
    "render a saved dashboard from dashboards/<name>.json (mutually exclusive with --view/--artifacts)"
  ).option(
    "--dashboards <names>",
    "with --format site: the comma-separated publish set (saved dashboard names)"
  ).option(
    "--all-dashboards",
    "with --format site: publish every committed (non-.local) saved dashboard",
    false
  ).option(
    "--out <file>",
    "output file (default <path>/.ds-bridge/reports/dashboard.html; with --format md, redirects the scorecard to a file instead of stdout)"
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
  appendFileSync as appendFileSync11,
  existsSync as existsSync18,
  mkdirSync as mkdirSync15,
  readdirSync as readdirSync4,
  readFileSync as readFileSync20,
  statSync as statSync11,
  writeFileSync as writeFileSync11
} from "fs";
import { isAbsolute as isAbsolute4, join as join23, relative as relative2, resolve as resolve12, sep as sep4 } from "path";

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
        const value2 = parseString();
        if (value2 !== void 0) values.push({ name, raw: value2 });
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
var PARSERS5 = {
  w3c: parseW3c,
  "tokens-studio": parseTokensStudio,
  "style-dictionary": parseStyleDictionary
};
function previewValue(value2) {
  if (typeof value2 === "string") return value2;
  if (typeof value2 === "number") return String(value2);
  return JSON.stringify(value2);
}
function countsByType(map) {
  const counts = /* @__PURE__ */ new Map();
  for (const token of map.tokens) {
    counts.set(token.type, (counts.get(token.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value2]) => ({ label, value: value2 })).sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : 1));
}
function renderTerm13(filePath, map, color) {
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
    raw = readFileSync20(filePath, "utf8");
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
  const outcome = PARSERS5[format](parsed);
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
var EXCLUDED_DIRS4 = /* @__PURE__ */ new Set([
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
    entries = readdirSync4(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join23(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS4.has(entry.name)) continue;
      walkOutputFiles(full, acc);
      continue;
    }
    if (entry.isFile() && hasOutputExtension(entry.name)) acc.push(full);
  }
}
function depthOf4(path) {
  return path.split(sep4).filter((s) => s.length > 0).length;
}
function isConventionalTokenFile4(name) {
  if (!name.endsWith(".json")) return false;
  return name === "tokens.json" || name === "design-tokens.json" || name.endsWith(".tokens.json");
}
function isTokenDir4(name) {
  return name === "tokens" || name === "design-tokens";
}
function collectTokenCandidates3(dir, insideTokenDir, acc) {
  let entries;
  try {
    entries = readdirSync4(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join23(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS4.has(entry.name)) continue;
      collectTokenCandidates3(
        full,
        insideTokenDir || isTokenDir4(entry.name),
        acc
      );
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    if (insideTokenDir || isConventionalTokenFile4(entry.name)) acc.push(full);
  }
}
function detectFileFormat4(absPath) {
  let raw;
  try {
    raw = readFileSync20(absPath, "utf8");
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
function discoverFirstTokenSource3(root) {
  const candidates = [];
  collectTokenCandidates3(root, false, candidates);
  const verified = candidates.filter((path) => detectFileFormat4(path) !== void 0).sort((a, b) => {
    const depth = depthOf4(a) - depthOf4(b);
    return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
  });
  return verified[0];
}
function resolveTokenSource2(targetDir, flagTokens) {
  if (flagTokens !== void 0) {
    const abs2 = isAbsolute4(flagTokens) ? flagTokens : resolve12(process.cwd(), flagTokens);
    if (!existsSync18(abs2)) {
      return {
        kind: "error",
        message: `Token source "${abs2}" (from --tokens) does not exist.`
      };
    }
    return { kind: "ok", path: abs2 };
  }
  const configPath = join23(targetDir, ".ds-bridge.json");
  if (existsSync18(configPath)) {
    let projectFileText;
    try {
      projectFileText = readFileSync20(configPath, "utf8");
    } catch {
      projectFileText = void 0;
    }
    if (projectFileText !== void 0) {
      const resolved = resolveConfig({ projectFileText });
      if (resolved.kind === "ok" && resolved.config.tokenSource !== void 0) {
        const src = resolved.config.tokenSource;
        const abs2 = isAbsolute4(src) ? src : resolve12(targetDir, src);
        if (existsSync18(abs2)) return { kind: "ok", path: abs2 };
        return {
          kind: "error",
          message: `token_source "${abs2}" from .ds-bridge.json does not exist.`
        };
      }
    }
  }
  const discovered = discoverFirstTokenSource3(targetDir);
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
    raw = readFileSync20(tokenPath, "utf8");
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
    if (resolve12(file) === resolve12(tokenSourcePath)) continue;
    let content;
    try {
      content = readFileSync20(file, "utf8");
    } catch {
      continue;
    }
    const outcome = scanOutputs({ path: file, content });
    if (outcome.kind !== "ok") continue;
    for (const warning of outcome.warnings) {
      warnings.push(`${relative2(outputsDir, file)}: ${warning}`);
    }
    for (const value2 of outcome.values) {
      const prior = ownerByName.get(value2.name);
      if (prior !== void 0 && prior !== file) {
        warnings.push(
          `output "${value2.name}" defined in both ${relative2(outputsDir, prior)} and ${relative2(outputsDir, file)} \u2014 later wins`
        );
      }
      merged.set(value2.name, value2);
      ownerByName.set(value2.name, file);
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
  mkdirSync15(stateDir, { recursive: true });
  appendFileSync11(
    join23(stateDir, "history.jsonl"),
    `${JSON.stringify(record)}
`,
    "utf8"
  );
}
function readDriftTrend(stateDir) {
  const historyPath = join23(stateDir, "history.jsonl");
  let text;
  try {
    text = readFileSync20(historyPath, "utf8");
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
  const reportsDir = join23(stateDir, "reports");
  mkdirSync15(reportsDir, { recursive: true });
  const date = generatedAt.slice(0, 10);
  const reportPath = join23(reportsDir, `tokens-${date}.html`);
  writeFileSync11(reportPath, html, "utf8");
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
  const targetDir = resolve12(path);
  if (!existsSync18(targetDir) || !statSync11(targetDir).isDirectory()) {
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
  const outputsDir = options.outputs !== void 0 ? resolve12(options.outputs) : targetDir;
  if (!existsSync18(outputsDir) || !statSync11(outputsDir).isDirectory()) {
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
  const stateDir = join23(targetDir, ".ds-bridge");
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
    process.stdout.write(`${renderTerm13(path, map, color)}
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
  registerFrameImplCommand(program2);
  registerRegistryCommand(program2);
  registerParityCommand(program2);
  registerA11yCommand(program2);
  registerImpactCommand(program2);
  registerLibraryHealthCommand(program2);
  registerAdoptionCommand(program2);
  registerChangelogCommand(program2);
  registerDocsCommand(program2);
  registerDashboardCommand(program2);
  registerDigestCommand(program2);
  registerConfigCommand(program2);
  registerReleaseCheckCommand(program2);
  return program2;
}
loadDotenvInto(join24(process.cwd(), ".ds-bridge.env"), process.env);
buildProgram().parse();
export {
  buildProgram
};
