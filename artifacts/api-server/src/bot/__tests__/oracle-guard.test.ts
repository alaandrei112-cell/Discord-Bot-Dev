import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock discord.js — only PermissionFlagsBits is used at runtime ─────────────
vi.mock("discord.js", () => ({
  AuditLogEvent: { MemberUpdate: 24 },
  PermissionFlagsBits: { ModerateMembers: 268435456n },
}));

// ── Mock logger so test output stays clean ────────────────────────────────────
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock status-effects so tests control clearCurses return value ─────────────
vi.mock("../status-effects", () => ({
  clearCurses: vi.fn().mockReturnValue(0),
  grantRandomCurse: vi.fn().mockReturnValue({ id: "curse-test", label: "Blestem Test", emoji: "🌑" }),
}));

// Import after mocks are registered
import {
  buildPatterns,
  containsSwear,
  handleToxicity,
  handlePardon,
  handleJustice,
  enforceOracleTimeout,
  rememberOracleTimeout,
  setOracleToxicityRelationshipHandler,
  isPardonRequest,
  isJusticeRequest,
  isMockery,
  envInt,
} from "../oracle-guard";
import { clearCurses, grantRandomCurse } from "../status-effects";
import type { Client, Message } from "discord.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal fake Message that covers every property handleToxicity reads.
 * Each call to makeMessage should use a unique authorId so offense records
 * accumulated across tests don't skew the escalation step.
 */
function makeMessage(opts: {
  botId: string;
  content: string;
  authorId: string;
  isMentioned?: boolean;
  hasPermission?: boolean;
  memberManageable?: boolean;
  timeoutFn?: ReturnType<typeof vi.fn>;
}) {
  const {
    botId,
    content,
    authorId,
    isMentioned = true,
    hasPermission = true,
    memberManageable = true,
  } = opts;

  const mockTimeout = opts.timeoutFn ?? vi.fn().mockResolvedValue(undefined);

  const member = {
    manageable: memberManageable,
    timeout: mockTimeout,
  };

  const botMember = {
    permissions: { has: vi.fn().mockReturnValue(hasPermission) },
  };

  const mockReply = vi.fn().mockResolvedValue(undefined);

  const msg = {
    mentions: { users: { has: vi.fn().mockReturnValue(isMentioned) } },
    content,
    author: { id: authorId },
    member,
    guild: {
      members: {
        me: botMember,
        fetch: vi.fn().mockResolvedValue(member),
      },
      ownerId: "guild-owner-id",
    },
    reply: mockReply,
    _timeout: mockTimeout,
    _reply: mockReply,
    _botMember: botMember,
  };

  return msg;
}

function makeClient(botId: string) {
  return { user: { id: botId } } as unknown as Client;
}

// ─── containsSwear ─────────────────────────────────────────────────────────────

describe("containsSwear", () => {
  it("returns false for clean, respectful text", () => {
    expect(containsSwear("Bună ziua, Oracolule!")).toBe(false);
  });

  it("returns false for a justice trigger phrase (not a swear)", () => {
    expect(containsSwear("fa dreptate oracolule")).toBe(false);
  });

  it("detects 'pula' (exact base form)", () => {
    expect(containsSwear("pula ta")).toBe(true);
  });

  it("detects 'muie'", () => {
    expect(containsSwear("muie oracle")).toBe(true);
  });

  it("detects 'pizda'", () => {
    expect(containsSwear("pizda mea")).toBe(true);
  });

  it("normalises diacritics — 'pulă' matches the 'pula' pattern", () => {
    expect(containsSwear("pulă")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(containsSwear("PULA")).toBe(true);
    expect(containsSwear("Muie")).toBe(true);
  });

  it("does not false-positive on partial-word matches (word boundary required)", () => {
    // "formula" contains "la" but not a swear word as a whole token
    expect(containsSwear("formula magica")).toBe(false);
  });

  it("catches vocative / inflected insult forms (how insults are actually used)", () => {
    expect(containsSwear("esti prost")).toBe(true);
    expect(containsSwear("prostule")).toBe(true);
    expect(containsSwear("idiotule")).toBe(true);
    expect(containsSwear("imbecilule")).toBe(true);
    expect(containsSwear("cretinule ce esti")).toBe(true);
    expect(containsSwear("boule")).toBe(true);
    expect(containsSwear("magarule")).toBe(true);
  });

  it("catches feminine insult forms via dedicated stems", () => {
    expect(containsSwear("esti proasta")).toBe(true);
    expect(containsSwear("proasto")).toBe(true);
    expect(containsSwear("idioata")).toBe(true);
    expect(containsSwear("idioată")).toBe(true);
    expect(containsSwear("dobitoaca")).toBe(true);
  });

  it("catches 'bou' inflections via stem (boul/boului/boilor)", () => {
    expect(containsSwear("esti un bou")).toBe(true);
    expect(containsSwear("boul")).toBe(true);
    expect(containsSwear("boului")).toBe(true);
    expect(containsSwear("boilor")).toBe(true);
  });

  it("catches profanity inflections via stem match", () => {
    expect(containsSwear("futu-te")).toBe(true);
    expect(containsSwear("te fut")).toBe(true);
    expect(containsSwear("muist")).toBe(true);
  });

  it("does not false-positive on innocent words that start like a short insult", () => {
    expect(containsSwear("merg in vacanta")).toBe(false);
    expect(containsSwear("ce curaj ai")).toBe(false);
    expect(containsSwear("imi place puloverul")).toBe(false);
    expect(containsSwear("porti un boiler")).toBe(false);
    expect(containsSwear("vasul e din portelan")).toBe(false);
  });

  it("does not mute innocent RPG/game talk (no overly broad animal triggers)", () => {
    expect(containsSwear("ce animal de companie sa aleg?")).toBe(false);
    expect(containsSwear("un curent de aer rece")).toBe(false);
  });

  it("catches 'dracu' and inflected forms (previously missing)", () => {
    expect(containsSwear("de dracu")).toBe(true);
    expect(containsSwear("la dracu cu tine")).toBe(true);
    expect(containsSwear("dracului de oracle")).toBe(true);
    expect(containsSwear("draci")).toBe(true);
    expect(containsSwear("dracilor")).toBe(true);
    expect(containsSwear("ei drace")).toBe(true);
  });

  it("does not false-positive on RPG terms that start with 'drac'", () => {
    expect(containsSwear("abilitate draconika")).toBe(false);
    expect(containsSwear("draconic power")).toBe(false);
  });

  it("catches 'cacat' and inflected forms", () => {
    expect(containsSwear("esti un cacat")).toBe(true);
    expect(containsSwear("cacati")).toBe(true);
  });

  it("catches 'netrebnic' and vocative forms", () => {
    expect(containsSwear("netrebnicule")).toBe(true);
    expect(containsSwear("netrebnicilor")).toBe(true);
  });

  it("catches 'ticalos' and feminine forms (normalised without diacritics)", () => {
    expect(containsSwear("esti un ticalos")).toBe(true);
    expect(containsSwear("ticaloasa")).toBe(true);
  });
});

// ─── buildPatterns ─────────────────────────────────────────────────────────────
//
// buildPatterns() is the pure function that compiles the RegExp list from the
// built-in stems/words plus any operator-supplied extras.  Testing it directly
// (without touching process.env or reloading the module) is the cleanest way
// to verify the pattern-compilation logic in isolation.

describe("isMockery", () => {
  it("returns false for clean, respectful text", () => {
    expect(isMockery("Bună ziua, Oracolule, ce evenimente urmează?")).toBe(false);
  });

  it("detects 'ia la misto' phrases", () => {
    expect(isMockery("iei la misto pe toata lumea")).toBe(true);
    expect(isMockery("ia la mișto botul asta")).toBe(true);
  });

  it("detects belittling 'esti X' phrases", () => {
    expect(isMockery("esti praf")).toBe(true);
    expect(isMockery("ești jalnic")).toBe(true);
    expect(isMockery("esti o gluma")).toBe(true);
  });

  it("detects 'bot X' mockery", () => {
    expect(isMockery("ce bot penibil")).toBe(true);
    expect(isMockery("botul asta e un bot inutil")).toBe(true);
  });

  it("detects mock words like clovn/papagal/taci", () => {
    expect(isMockery("taci odata")).toBe(true);
    expect(isMockery("esti un clovn")).toBe(true);
    expect(isMockery("papagalule")).toBe(true);
  });

  it("detects 'habar n-ai' / 'nu stii nimic'", () => {
    expect(isMockery("habar n-ai despre ce vorbesti")).toBe(true);
    expect(isMockery("nu stii nimic")).toBe(true);
  });

  it("does not fire on normal game questions", () => {
    expect(isMockery("cand apare boss-ul final?")).toBe(false);
    expect(isMockery("vreau sa cumpar un talisman")).toBe(false);
  });
});

describe("buildPatterns", () => {
  it("returns patterns that still catch built-in swear stems when no extras are given", () => {
    const patterns = buildPatterns([]);
    const hit = (text: string) =>
      patterns.some((re) => re.test(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));

    expect(hit("pula")).toBe(true);
    expect(hit("muie")).toBe(true);
    expect(hit("prost")).toBe(true);
    expect(hit("bou")).toBe(true);
    expect(hit("buna ziua")).toBe(false);
  });

  it("extra words are detected when passed to buildPatterns", () => {
    const patterns = buildPatterns(["hacker", "spam"]);
    const hit = (text: string) =>
      patterns.some((re) => re.test(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));

    expect(hit("hacker rau")).toBe(true);
    expect(hit("trimiti spam")).toBe(true);
    expect(hit("clean message")).toBe(false);
  });

  it("diacritic variants of extra words are normalised and still match", () => {
    // "spămos" added with diacritic; the normalised form "spamos" should match
    // both the diacritic and the plain form in the checked text.
    const patterns = buildPatterns(["spămos"]);
    const normalise = (t: string) =>
      t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const hit = (text: string) => patterns.some((re) => re.test(normalise(text)));

    expect(hit("spamos")).toBe(true);   // plain form
    expect(hit("spămos")).toBe(true);   // diacritic form (normalised before match)
    expect(hit("alt cuvant")).toBe(false);
  });

  it("extra words with special regex characters are escaped and still match literally", () => {
    // Words containing regex metacharacters must be treated as literals so they
    // neither throw nor match the wrong text.  We use words where the special
    // char sits between two word-char letters so both \b anchors fire normally.
    const patterns = buildPatterns(["f.ck", "s+it"]);
    const hit = (text: string) =>
      patterns.some((re) =>
        re.test(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
      );

    expect(hit("f.ck")).toBe(true);   // literal dot matched
    expect(hit("s+it")).toBe(true);   // literal plus matched
    expect(hit("fick")).toBe(false);  // "fick" does NOT match "f.ck" (dot is literal, not wildcard)
    expect(hit("sxit")).toBe(false);  // "sxit" does NOT match "s+it" (plus is literal, not quantifier)
  });

  it("extra words are matched as whole words — they do not fire on longer containing words", () => {
    const patterns = buildPatterns(["rau"]);
    const hit = (text: string) =>
      patterns.some((re) =>
        re.test(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
      );

    expect(hit("rau")).toBe(true);        // standalone — should match
    expect(hit("rau de tot")).toBe(true); // word boundary before space
    expect(hit("raul Dunarea")).toBe(false); // "raul" is a different word (river)
    expect(hit("brau")).toBe(false);      // inside "brau" — no leading boundary
  });

  it("empty string items in the extra-word list are ignored", () => {
    // Split of a string with trailing commas can produce empty strings;
    // they should not produce an always-matching empty pattern.
    const patterns = buildPatterns(["", "  ", "spam"]);
    const hit = (text: string) =>
      patterns.some((re) =>
        re.test(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
      );

    expect(hit("buna ziua")).toBe(false); // empty pattern would match everything
    expect(hit("spam")).toBe(true);
  });
});

// ─── ORACLE_SWEAR_WORDS env var (module-reload tests) ─────────────────────────
//
// The pattern list is compiled once at module-load time.  These tests use
// vi.resetModules() + dynamic import to load a fresh copy of oracle-guard with
// a controlled ORACLE_SWEAR_WORDS value, confirming that:
//   • operator-added words are detected after a restart,
//   • an empty env var leaves the base list unchanged, and
//   • a change while the module is running has NO effect (load-time snapshot).

describe("ORACLE_SWEAR_WORDS env var — module-reload behaviour", () => {
  afterEach(() => {
    delete process.env.ORACLE_SWEAR_WORDS;
    vi.resetModules();
  });

  it("extra words set in ORACLE_SWEAR_WORDS are detected after module load", async () => {
    process.env.ORACLE_SWEAR_WORDS = "interzis,blocat";
    vi.resetModules();

    const { containsSwear: cs } = await import("../oracle-guard");

    expect(cs("mesaj interzis")).toBe(true);
    expect(cs("cont blocat acum")).toBe(true);
    expect(cs("mesaj normal")).toBe(false);
  });

  it("an empty ORACLE_SWEAR_WORDS string leaves only the built-in base list", async () => {
    process.env.ORACLE_SWEAR_WORDS = "";
    vi.resetModules();

    const { containsSwear: cs } = await import("../oracle-guard");

    // Built-in words still work
    expect(cs("pula")).toBe(true);
    // A custom word that was NOT in the base list is not detected
    expect(cs("interzis")).toBe(false);
  });

  it("ORACLE_SWEAR_WORDS with whitespace-padded entries is handled correctly", async () => {
    process.env.ORACLE_SWEAR_WORDS = "  cuvant1  ,  cuvant2  ";
    vi.resetModules();

    const { containsSwear: cs } = await import("../oracle-guard");

    expect(cs("scriu cuvant1 aici")).toBe(true);
    expect(cs("si cuvant2 de asemenea")).toBe(true);
  });

  it("changing ORACLE_SWEAR_WORDS after module load has no effect on the running instance", async () => {
    process.env.ORACLE_SWEAR_WORDS = "";
    vi.resetModules();

    const { containsSwear: cs } = await import("../oracle-guard");

    // Module is loaded without "secret" in the list
    expect(cs("secret")).toBe(false);

    // Changing the env var now should have no effect on the already-loaded module
    process.env.ORACLE_SWEAR_WORDS = "secret";
    expect(cs("secret")).toBe(false); // still false — list is frozen at load time
  });
});

// ─── handleToxicity ───────────────────────────────────────────────────────────

describe("handleToxicity", () => {
  const BOT_ID = "oracle-bot-id";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false immediately when the bot is not ready (client.user is null)", async () => {
    const msg = makeMessage({ botId: BOT_ID, content: "pula", authorId: "u-notready" });
    const client = { user: null } as unknown as Client;
    const result = await handleToxicity(client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("stays silent when toxic text is not directed at the bot", async () => {
    const msg = makeMessage({
      botId: BOT_ID,
      content: "pula",
      authorId: "u-notmentioned",
      isMentioned: false,
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
    expect(msg._timeout).not.toHaveBeenCalled();
  });

  it("returns false for clean text even when the bot is mentioned", async () => {
    const msg = makeMessage({
      botId: BOT_ID,
      content: "buna ziua oracolule cum esti",
      authorId: "u-clean",
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns true and posts a reply when a swear word is detected", async () => {
    const msg = makeMessage({ botId: BOT_ID, content: "pula", authorId: "u-swear-basic" });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
  });

  it("mutes + warns on a plain insult (no hard profanity), e.g. 'prostule'", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "esti prostule",
      authorId: "u-insult-prostule",
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(true);
    expect(mockTimeout).toHaveBeenCalledOnce();
    expect(msg._reply).toHaveBeenCalledOnce();
  });

  it("issues Discord timeout when bot has ModerateMembers + member is manageable", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "muie",
      authorId: "u-muted-ok",
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(mockTimeout).toHaveBeenCalledOnce();
  });

  it("does NOT include the 'no-power' note in the reply when timeout succeeded", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "pula",
      authorId: "u-muted-clean-reply",
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).not.toContain("nu deține puterea");
  });

  it("skips timeout when bot lacks ModerateMembers permission", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "pizda",
      authorId: "u-noperm",
      hasPermission: false,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(mockTimeout).not.toHaveBeenCalled();
  });

  it("includes the 'no-power' note when permission is missing", async () => {
    const msg = makeMessage({
      botId: BOT_ID,
      content: "pizda",
      authorId: "u-noperm-note",
      hasPermission: false,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("nu deține puterea");
  });

  it("skips timeout when member.manageable is false (role hierarchy blocks it)", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "futu-te",
      authorId: "u-unmanageable",
      hasPermission: true,
      memberManageable: false,
      timeoutFn: mockTimeout,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(mockTimeout).not.toHaveBeenCalled();
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("nu deține puterea");
  });

  it("still replies even when the timeout call itself throws", async () => {
    const mockTimeout = vi.fn().mockRejectedValue(new Error("Missing Access"));
    const msg = makeMessage({
      botId: BOT_ID,
      content: "muie",
      authorId: "u-timeout-throws",
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
  });

  it("strips @mention tokens before checking for swear words", async () => {
    // The raw content includes a mention prefix but the swear word is still there
    const msg = makeMessage({
      botId: BOT_ID,
      content: "<@oracle-bot-id> pula ta",
      authorId: "u-mention-swear",
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(true);
  });

  it("adds the harsher warning when the toxicity penalty leaves the relationship negative", async () => {
    setOracleToxicityRelationshipHandler(async () => ({
      bondBefore: 4,
      bondAfter: -26,
      relationDelta: -30,
    }));

    const msg = makeMessage({
      botId: BOT_ID,
      content: "pula",
      authorId: "u-negative-oracle-bond",
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);

    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("Legătura ta cu Oracolul este deja în umbră");
    setOracleToxicityRelationshipHandler(null);
  });
});

describe("enforceOracleTimeout", () => {
  function makeMemberUpdateFixture(executorId: string, userId: string, timeoutFn: ReturnType<typeof vi.fn>) {
    const member = { manageable: true, timeout: timeoutFn };
    const guild = {
      id: `timeout-guild-${userId}`,
      ownerId: "server-owner",
      fetchAuditLogs: vi.fn().mockResolvedValue({
        entries: {
          find: (predicate: (entry: unknown) => boolean) =>
            predicate({
              target: { id: userId },
              createdTimestamp: Date.now(),
              changes: [{ key: "communication_disabled_until" }],
              executor: { id: executorId },
            })
              ? { executor: { id: executorId } }
              : undefined,
        },
      }),
      members: {
        cache: new Map([[userId, member]]),
        resolve: vi.fn().mockReturnValue(member),
        me: { permissions: { has: vi.fn().mockReturnValue(true) } },
      },
    };
    return { guild, oldMember: { guild, id: userId, communicationDisabledUntilTimestamp: Date.now() + 30_000 }, newMember: { guild, id: userId, communicationDisabledUntilTimestamp: null } };
  }

  it("allows only the server owner to remove an active Oracle timeout", async () => {
    const timeoutFn = vi.fn().mockResolvedValue(undefined);
    const { guild, oldMember, newMember } = makeMemberUpdateFixture("server-owner", "owner-lift-test", timeoutFn);
    rememberOracleTimeout(guild.id, newMember.id, 60_000);

    await expect(
      enforceOracleTimeout(
        oldMember as unknown as Parameters<typeof enforceOracleTimeout>[0],
        newMember as unknown as Parameters<typeof enforceOracleTimeout>[1],
      ),
    ).resolves.toBe(true);
    expect(timeoutFn).not.toHaveBeenCalled();
    expect(guild.fetchAuditLogs).toHaveBeenCalledOnce();
  });

  it("reapplies the remaining timeout when another moderator removes it", async () => {
    const timeoutFn = vi.fn().mockResolvedValue(undefined);
    const { guild, oldMember, newMember } = makeMemberUpdateFixture("other-moderator", "moderator-lift-test", timeoutFn);
    rememberOracleTimeout(guild.id, newMember.id, 60_000);

    await expect(
      enforceOracleTimeout(
        oldMember as unknown as Parameters<typeof enforceOracleTimeout>[0],
        newMember as unknown as Parameters<typeof enforceOracleTimeout>[1],
      ),
    ).resolves.toBe(true);
    expect(timeoutFn).toHaveBeenCalledWith(
      expect.any(Number),
      "Oracolul — doar creatorul serverului poate ridica acest blestem",
    );
  });
});

// ─── envInt ────────────────────────────────────────────────────────────────────

describe("envInt", () => {
  const VAR = "TEST_ORACLE_ENVINT";

  afterEach(() => {
    delete process.env[VAR];
  });

  it("returns the fallback when the env var is not set", () => {
    delete process.env[VAR];
    expect(envInt(VAR, 30)).toBe(30);
  });

  it("returns the fallback when the env var is an empty string", () => {
    process.env[VAR] = "";
    expect(envInt(VAR, 30)).toBe(30);
  });

  it("returns the fallback and warns when the env var is a non-numeric string", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "banana";
    const result = envInt(VAR, 30);
    expect(result).toBe(30);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "banana", fallback: 30 }),
      expect.any(String),
    );
  });

  it("returns the fallback and warns when the env var is zero", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "0";
    const result = envInt(VAR, 30);
    expect(result).toBe(30);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "0", fallback: 30 }),
      expect.any(String),
    );
  });

  it("returns the fallback and warns when the env var is a negative number", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "-5";
    const result = envInt(VAR, 30);
    expect(result).toBe(30);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "-5", fallback: 30 }),
      expect.any(String),
    );
  });

  it("returns the fallback and warns when the env var is a float", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "3.14";
    const result = envInt(VAR, 30);
    expect(result).toBe(30);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "3.14", fallback: 30 }),
      expect.any(String),
    );
  });

  it("clamps to max and warns when the value exceeds the allowed maximum", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "9999";
    const result = envInt(VAR, 30, 1440);
    expect(result).toBe(1440);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "9999", max: 1440 }),
      expect.any(String),
    );
  });

  it("returns the value as-is when it is valid and within the max", () => {
    process.env[VAR] = "60";
    expect(envInt(VAR, 30, 1440)).toBe(60);
  });

  it("returns the value when it exactly equals the max", () => {
    process.env[VAR] = "1440";
    expect(envInt(VAR, 30, 1440)).toBe(1440);
  });

  it("returns the value as-is when no max is provided, even for a large number", () => {
    process.env[VAR] = "9999";
    expect(envInt(VAR, 30)).toBe(9999);
  });
});

// ─── isPardonRequest ───────────────────────────────────────────────────────────

describe("isPardonRequest", () => {
  it("returns true for 'iarta'", () => {
    expect(isPardonRequest("iarta")).toBe(true);
  });

  it("returns true for 'iarta-l' (with suffix)", () => {
    expect(isPardonRequest("iarta-l")).toBe(true);
  });

  it("returns true for 'reseteaza blestemul'", () => {
    expect(isPardonRequest("reseteaza blestemul")).toBe(true);
  });

  it("returns true for 'pardoneaza-l'", () => {
    expect(isPardonRequest("pardoneaza-l")).toBe(true);
  });

  it("returns false for plain justice text", () => {
    expect(isPardonRequest("fa dreptate")).toBe(false);
  });

  it("returns false for clean unrelated text", () => {
    expect(isPardonRequest("buna ziua oracolule")).toBe(false);
  });
});

// ─── handlePardon ─────────────────────────────────────────────────────────────

/**
 * Build a minimal fake Message for handlePardon tests.
 * `targetIds` are the users that appear in message.mentions.users.
 */
function makePardonMessage(opts: {
  authorId: string;
  content: string;
  guildOwnerId?: string;
  targetIds?: string[];
  targetBot?: boolean;
  hasPermission?: boolean;
  memberManageable?: boolean;
  timeoutFn?: ReturnType<typeof vi.fn>;
}) {
  const {
    authorId,
    content,
    guildOwnerId = "guild-owner-id",
    targetIds = [],
    targetBot = false,
    hasPermission = true,
    memberManageable = true,
  } = opts;

  const mockTimeout = opts.timeoutFn ?? vi.fn().mockResolvedValue(undefined);

  // Build the members map for mentions.users
  const mentionedUsers = new Map(
    targetIds.map((id) => [
      id,
      { id, bot: targetBot, username: `user-${id}` },
    ]),
  );

  const targetMember = {
    displayName: `DisplayName-${targetIds[0] ?? "?"}`,
    manageable: memberManageable,
    timeout: mockTimeout,
  };

  const botMember = {
    permissions: { has: vi.fn().mockReturnValue(hasPermission) },
  };

  const mockReply = vi.fn().mockResolvedValue(undefined);

  const msg = {
    content,
    author: { id: authorId, bot: false },
    guild: {
      ownerId: guildOwnerId,
      members: {
        me: botMember,
        fetch: vi.fn().mockResolvedValue(targetMember),
      },
    },
    mentions: {
      users: {
        filter: (pred: (u: { id: string; bot: boolean }) => boolean) => {
          const filtered = new Map<string, { id: string; bot: boolean; username: string }>();
          for (const [id, u] of mentionedUsers) {
            if (pred(u as { id: string; bot: boolean })) filtered.set(id, u);
          }
          return filtered;
        },
        size: mentionedUsers.size,
      },
    },
    reply: mockReply,
    _reply: mockReply,
    _timeout: mockTimeout,
    _botMember: botMember,
  };

  return msg;
}

describe("handlePardon", () => {
  const OWNER_ID = "guild-owner-id";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ORACLE_OWNER_ID = OWNER_ID;
  });

  afterEach(() => {
    delete process.env.ORACLE_OWNER_ID;
  });

  it("returns false when the author is not the owner", async () => {
    const msg = makePardonMessage({
      authorId: "random-user-999",
      content: "iarta-l pe acest om",
      targetIds: ["target-u1"],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false when the content is not a pardon request", async () => {
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "fa dreptate oracolule",
      targetIds: ["target-u2"],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false when there are no non-bot, non-owner targets mentioned", async () => {
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta",
      targetIds: [],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false when only the bot itself is mentioned", async () => {
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta",
      targetIds: ["bot-id-xyz"],
      targetBot: true,
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns true and replies with the absolution message for a valid pardon", async () => {
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta-l",
      targetIds: ["target-u3"],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("Cartea Iertării");
  });

  it("clears game curses for the pardoned user", async () => {
    const clearCursesMock = vi.mocked(clearCurses);
    clearCursesMock.mockReturnValue(2); // had 2 active curses

    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "reseteaza blestemul",
      targetIds: ["target-u4"],
    });
    await handlePardon({} as Client, msg as unknown as Message);
    expect(clearCursesMock).toHaveBeenCalledWith("target-u4");
  });

  it("mentions lifted curses in the reply when the user had active curses", async () => {
    vi.mocked(clearCurses).mockReturnValue(1); // had curses

    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "ierta",
      targetIds: ["target-u5"],
    });
    await handlePardon({} as Client, msg as unknown as Message);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("blestemurile ridicate");
  });

  it("calls member.timeout(null) to lift an active Discord timeout", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta-l",
      targetIds: ["target-u6"],
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handlePardon({} as Client, msg as unknown as Message);
    expect(mockTimeout).toHaveBeenCalledWith(null, expect.any(String));
  });

  it("does NOT call member.timeout(null) when bot lacks ModerateMembers permission", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "pardoneaza-l",
      targetIds: ["target-u7"],
      hasPermission: false,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handlePardon({} as Client, msg as unknown as Message);
    expect(mockTimeout).not.toHaveBeenCalled();
  });

  it("does NOT call member.timeout(null) when member is not manageable", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta",
      targetIds: ["target-u8"],
      hasPermission: true,
      memberManageable: false,
      timeoutFn: mockTimeout,
    });
    await handlePardon({} as Client, msg as unknown as Message);
    expect(mockTimeout).not.toHaveBeenCalled();
  });

  it("still returns true and replies even if member.timeout(null) throws", async () => {
    const mockTimeout = vi.fn().mockRejectedValue(new Error("Missing Access"));
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "ierta",
      targetIds: ["target-u9"],
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
  });

  it("shows 'already clean' message when the user had no offenses and no curses", async () => {
    vi.mocked(clearCurses).mockReturnValue(0); // no curses
    // No prior offense recorded for this unique user id

    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "ierta",
      targetIds: ["target-u-clean-slate"],
    });
    await handlePardon({} as Client, msg as unknown as Message);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("sufletul acestui muritor era deja curat");
  });

  it("accepts the guild owner as the pardoning authority when ORACLE_OWNER_ID is not set", async () => {
    delete process.env.ORACLE_OWNER_ID;

    const msg = makePardonMessage({
      authorId: "guild-owner-id",
      content: "iarta-l",
      guildOwnerId: "guild-owner-id",
      targetIds: ["target-u10"],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(true);
  });
});

// ─── isJusticeRequest ──────────────────────────────────────────────────────────

describe("isJusticeRequest", () => {
  it("detects 'fa dreptate'", () => {
    expect(isJusticeRequest("fa dreptate")).toBe(true);
  });

  it("detects 'face dreptate'", () => {
    expect(isJusticeRequest("face dreptate")).toBe(true);
  });

  it("detects 'judeca-i'", () => {
    expect(isJusticeRequest("judeca-i")).toBe(true);
  });

  it("detects 'judecati'", () => {
    expect(isJusticeRequest("judecati")).toBe(true);
  });

  it("detects 'penalizeaza'", () => {
    expect(isJusticeRequest("penalizeaza")).toBe(true);
  });

  it("detects 'curata canalul'", () => {
    expect(isJusticeRequest("curata canalul")).toBe(true);
  });

  it("detects 'fa ordine'", () => {
    expect(isJusticeRequest("fa ordine")).toBe(true);
  });

  it("detects 'aplica blestemul'", () => {
    expect(isJusticeRequest("aplica blestemul")).toBe(true);
  });

  it("detects 'pedepseste'", () => {
    expect(isJusticeRequest("pedepseste")).toBe(true);
  });

  it("detects 'executa dreptatea'", () => {
    expect(isJusticeRequest("executa dreptatea")).toBe(true);
  });

  it("normalises diacritics — 'fă dreptate' matches 'fa dreptate' pattern", () => {
    expect(isJusticeRequest("fă dreptate")).toBe(true);
  });

  it("returns false for a pardon phrase", () => {
    expect(isJusticeRequest("iarta-l")).toBe(false);
  });

  it("returns false for plain conversation text", () => {
    expect(isJusticeRequest("buna ziua oracolule")).toBe(false);
  });

  it("returns false for a swear word (not a justice command)", () => {
    expect(isJusticeRequest("pula ta")).toBe(false);
  });
});

// ─── handleJustice ─────────────────────────────────────────────────────────────

/**
 * Build a minimal fake Message for handleJustice tests.
 *
 * `channelMessages` is a list of fake past messages that will be returned by
 * `channel.messages.fetch()`. Each entry specifies the author, content, and
 * how old the message is (in ms relative to now).
 */
function makeJusticeMessage(opts: {
  authorId: string;
  content: string;
  guildOwnerId?: string;
  channelMessages?: Array<{
    id: string;
    authorId: string;
    authorBot?: boolean;
    content: string;
    ageMs: number;
    displayName?: string;
  }>;
  fetchThrows?: boolean;
  hasPermission?: boolean;
  memberManageable?: boolean;
  offenderTimeoutFn?: ReturnType<typeof vi.fn>;
}) {
  const {
    authorId,
    content,
    guildOwnerId = "guild-owner-id",
    channelMessages = [],
    fetchThrows = false,
    hasPermission = true,
    memberManageable = true,
  } = opts;

  const offenderTimeout = opts.offenderTimeoutFn ?? vi.fn().mockResolvedValue(undefined);
  const mockReply = vi.fn().mockResolvedValue(undefined);

  const now = Date.now();

  // Build the past-message collection (Map, which has .values())
  const fetchedMap = new Map(
    channelMessages.map((m) => [
      m.id,
      {
        author: { id: m.authorId, bot: m.authorBot ?? false },
        content: m.content,
        createdTimestamp: now - m.ageMs,
        member: m.displayName ? { displayName: m.displayName } : null,
      },
    ]),
  );

  const botMember = {
    permissions: { has: vi.fn().mockReturnValue(hasPermission) },
  };

  const offenderMember = {
    manageable: memberManageable,
    timeout: offenderTimeout,
  };

  const channel = {
    isTextBased: () => true,
    messages: {
      fetch: fetchThrows
        ? vi.fn().mockRejectedValue(new Error("Missing Access"))
        : vi.fn().mockResolvedValue(fetchedMap),
    },
  };

  const msg = {
    content,
    id: "justice-trigger-msg-id",
    author: { id: authorId },
    channel,
    guild: {
      ownerId: guildOwnerId,
      members: {
        me: botMember,
        fetch: vi.fn().mockResolvedValue(offenderMember),
      },
    },
    reply: mockReply,
    _reply: mockReply,
    _offenderTimeout: offenderTimeout,
    _botMember: botMember,
  };

  // Add "messages" as a property to satisfy the `"messages" in channel` check.
  Object.defineProperty(msg.channel, "messages", {
    value: msg.channel.messages,
    enumerable: true,
  });

  return msg;
}

describe("handleJustice", () => {
  const OWNER_ID = "justice-owner-id";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ORACLE_OWNER_ID = OWNER_ID;
  });

  afterEach(() => {
    delete process.env.ORACLE_OWNER_ID;
  });

  it("returns false when client.user is null (bot not ready)", async () => {
    const msg = makeJusticeMessage({ authorId: OWNER_ID, content: "fa dreptate" });
    const client = { user: null } as unknown as Client;
    const result = await handleJustice(client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false when the author is not the owner", async () => {
    const msg = makeJusticeMessage({
      authorId: "random-user-abc",
      content: "fa dreptate",
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false when the message is not a justice request", async () => {
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "buna ziua oracolule",
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("strips @mention tokens before checking for justice phrase", async () => {
    // Use a realistic numeric Discord snowflake so the regex /<@!?\d+>/g actually strips it.
    // The content is ONLY the mention followed by the justice phrase — without stripping,
    // the leading `<@` chars before `fa` would prevent the \b boundary match in isJusticeRequest.
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "<@123456789012345678>fa dreptate",
      channelMessages: [],
    });
    const result = await handleJustice(
      { user: { id: "123456789012345678" } } as unknown as Client,
      msg as unknown as Message,
    );
    // No offenders → replies with clean-channel message and returns true.
    // If the mention were NOT stripped, `<@digits>fa` would break the \b boundary on "fa".
    expect(result).toBe(true);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("Canalul este curat");
  });

  it("returns false when channel.messages.fetch throws", async () => {
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      fetchThrows: true,
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("replies with the clean-channel message when no offenders are found", async () => {
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "m1", authorId: "innocent-user", content: "buna ziua", ageMs: 1000 },
      ],
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("Canalul este curat");
  });

  it("skips bot messages — bots are never penalised", async () => {
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "m-bot", authorId: "some-bot-id", authorBot: true, content: "pula", ageMs: 1000 },
      ],
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(result).toBe(true);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("Canalul este curat");
  });

  it("skips the owner's own messages — owner is never penalised", async () => {
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "m-owner", authorId: OWNER_ID, content: "pula", ageMs: 1000 },
      ],
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(result).toBe(true);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("Canalul este curat");
  });

  it("respects the time cutoff — messages older than the window are ignored", async () => {
    // Default window is 30 min = 1_800_000 ms; use 31 min old message
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        {
          id: "m-old",
          authorId: "offender-old",
          content: "pula",
          ageMs: 31 * 60 * 1000, // 31 minutes old → outside the 30-min default window
        },
      ],
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(result).toBe(true);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("Canalul este curat");
  });

  it("includes messages within the time window as offenders", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        {
          id: "m-recent",
          authorId: "offender-recent-u1",
          content: "muie",
          ageMs: 5 * 60 * 1000, // 5 minutes old → inside the 30-min window
          displayName: "BadUser",
        },
      ],
      offenderTimeoutFn: mockTimeout,
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(result).toBe(true);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("Cartea Judecății");
    expect(replyContent).toContain("BadUser");
  });

  it("applies grantRandomCurse to each unique offender", async () => {
    const grantCurseMock = vi.mocked(grantRandomCurse);

    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "m1", authorId: "offender-j1", content: "pizda", ageMs: 1000 },
        { id: "m2", authorId: "offender-j2", content: "muie", ageMs: 2000 },
      ],
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    // One curse per unique offender
    expect(grantCurseMock).toHaveBeenCalledTimes(2);
    expect(grantCurseMock).toHaveBeenCalledWith("offender-j1");
    expect(grantCurseMock).toHaveBeenCalledWith("offender-j2");
  });

  it("applies the Discord timeout to each offender when bot has permission", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "mx1", authorId: "offender-to1", content: "pula", ageMs: 1000 },
      ],
      hasPermission: true,
      memberManageable: true,
      offenderTimeoutFn: mockTimeout,
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(mockTimeout).toHaveBeenCalledOnce();
    // First arg is duration in ms (positive number), second is the reason string
    const [durationArg, reasonArg] = mockTimeout.mock.calls[0] as [number, string];
    expect(durationArg).toBeGreaterThan(0);
    expect(reasonArg).toContain("dreptate");
  });

  it("does not apply Discord timeout when bot lacks ModerateMembers permission", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "mx2", authorId: "offender-noperm", content: "pula", ageMs: 1000 },
      ],
      hasPermission: false,
      memberManageable: true,
      offenderTimeoutFn: mockTimeout,
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(mockTimeout).not.toHaveBeenCalled();
  });

  it("does not apply Discord timeout when member is not manageable", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "mx3", authorId: "offender-unmanageable", content: "pula", ageMs: 1000 },
      ],
      hasPermission: true,
      memberManageable: false,
      offenderTimeoutFn: mockTimeout,
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(mockTimeout).not.toHaveBeenCalled();
  });

  it("still returns true and posts verdict when member.timeout throws", async () => {
    const mockTimeout = vi.fn().mockRejectedValue(new Error("Missing Access"));
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "mx4", authorId: "offender-throw", content: "muie", ageMs: 1000, displayName: "ThrowUser" },
      ],
      hasPermission: true,
      memberManageable: true,
      offenderTimeoutFn: mockTimeout,
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
  });

  it("deduplicates offenders — multiple toxic messages from the same user count once", async () => {
    const grantCurseMock = vi.mocked(grantRandomCurse);

    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "dup1", authorId: "offender-dup", content: "pula", ageMs: 1000 },
        { id: "dup2", authorId: "offender-dup", content: "muie", ageMs: 2000 },
        { id: "dup3", authorId: "offender-dup", content: "idiot", ageMs: 3000 },
      ],
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    // Should be called exactly once for the deduplicated offender
    expect(grantCurseMock).toHaveBeenCalledTimes(1);
    expect(grantCurseMock).toHaveBeenCalledWith("offender-dup");
  });

  it("verdict reply contains the offender count and closing phrase", async () => {
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "vd1", authorId: "offender-vd1", content: "pula", ageMs: 1000, displayName: "VerdictUser" },
      ],
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("1");
    expect(replyContent).toContain("Dreptatea cenușii");
  });

  it("verdict reply includes the curse emoji and label from grantRandomCurse", async () => {
    vi.mocked(grantRandomCurse).mockReturnValue({
      id: "frozen", kind: "curse", label: "Îngheț Total", emoji: "❄️",
      flavor: "test", durationMs: 1000, mods: {},
    });

    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "ce1", authorId: "offender-ce1", content: "pula", ageMs: 1000, displayName: "FrozenUser" },
      ],
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("❄️");
    expect(replyContent).toContain("Îngheț Total");
  });

  it("accepts the guild owner as the justice authority when ORACLE_OWNER_ID is not set", async () => {
    delete process.env.ORACLE_OWNER_ID;

    const msg = makeJusticeMessage({
      authorId: "guild-owner-id",
      content: "fa dreptate",
      guildOwnerId: "guild-owner-id",
      channelMessages: [],
    });
    const result = await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    // No offenders → clean-channel reply, but still handled (true)
    expect(result).toBe(true);
  });

  it("verdict reply marks the timeout as 'fără putere de amuțire' when mute was skipped", async () => {
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "np1", authorId: "offender-np1", content: "pula", ageMs: 1000, displayName: "NoPowerUser" },
      ],
      hasPermission: false,
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("fără putere de amuțire");
  });

  it("verdict reply shows timed mute string when timeout succeeds", async () => {
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "ok1", authorId: "offender-ok1", content: "pula", ageMs: 1000, displayName: "MutedUser" },
      ],
      hasPermission: true,
      memberManageable: true,
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("tăcere forțată");
    expect(replyContent).not.toContain("fără putere de amuțire");
  });

  it("applies a timeout to EACH unique offender, not just the first", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeJusticeMessage({
      authorId: OWNER_ID,
      content: "fa dreptate",
      channelMessages: [
        { id: "mo1", authorId: "offender-multi-a", content: "pula", ageMs: 1000, displayName: "UserA" },
        { id: "mo2", authorId: "offender-multi-b", content: "muie", ageMs: 2000, displayName: "UserB" },
        { id: "mo3", authorId: "offender-multi-c", content: "idiot", ageMs: 3000, displayName: "UserC" },
      ],
      hasPermission: true,
      memberManageable: true,
      offenderTimeoutFn: mockTimeout,
    });
    await handleJustice(
      { user: { id: "bot-id" } } as unknown as Client,
      msg as unknown as Message,
    );
    // guild.members.fetch is called once per unique offender
    expect(msg.guild.members.fetch).toHaveBeenCalledTimes(3);
    // timeout is applied to each offender
    expect(mockTimeout).toHaveBeenCalledTimes(3);
    // verdict lists all 3
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("3");
  });
});
