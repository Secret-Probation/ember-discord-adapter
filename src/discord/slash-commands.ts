/** Global slash command payload for Discord API v10 (SPEC §5). */

export type DiscordApplicationCommand = {
  name: string;
  type: 1;
  integration_types: [0];
  contexts: [0];
  description: string;
  options: DiscordSubcommand[];
};

export type DiscordSubcommand = {
  type: 1;
  name: string;
  description: string;
  options?: DiscordStringOption[];
};

export type DiscordStringOption = {
  type: 3;
  name: string;
  description: string;
  required: boolean;
  min_length: number;
  max_length: number;
};

const QUERY_OPTION: DiscordStringOption = {
  type: 3,
  name: "query",
  description: "What to search or ask about released episodes",
  required: true,
  min_length: 1,
  max_length: 2000,
};

/** Full global command set — `register` script is the only writer (SPEC §5). */
export function emberGlobalCommands(): DiscordApplicationCommand[] {
  return [
    {
      name: "ember",
      type: 1,
      integration_types: [0],
      contexts: [0],
      description: "Search and ask Ember about this show's released archive",
      options: [
        {
          type: 1,
          name: "search",
          description: "Free search over released episodes (up to 5 moments)",
          options: [QUERY_OPTION],
        },
        {
          type: 1,
          name: "ask",
          description: "Ask Ember a question (uses creator Ask credits)",
          options: [QUERY_OPTION],
        },
        {
          type: 1,
          name: "about",
          description: "Show name, Ask availability, and public archive link",
        },
      ],
    },
  ];
}
