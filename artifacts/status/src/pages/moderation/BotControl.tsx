import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, CircleHelp, Loader2, Save, Radio, Megaphone, Ticket, ShieldCheck, PlayCircle, RotateCcw, CheckCircle2, ChevronDown, Clock3, Folder, Hash, LockKeyhole, Settings2, Users, Wrench, Link2, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ImageField } from "../../components/moderation/ImageField";
import { DiscordEmojiText, EmojiField } from "../../components/moderation/EmojiField";
import { useActiveGuild, useBotControl, useInviteStats, useModerationMetadata, useSession, type BotControlConfig, type ChannelPermissionConfig, type InviteStatsRange, type TicketFlowConfig } from "../../hooks/use-moderation-api";
import { rebaseDraftChanges } from "../../lib/utils";
import { useToast } from "../../hooks/use-toast";
import { useLocation, useSearch } from "wouter";

type BotControlTab = "channels" | "roles" | "tickets" | "messages" | "statistics";
const BOT_CONTROL_TABS: BotControlTab[] = ["channels", "roles", "tickets", "messages", "statistics"];

const CHANNELS = [
  ["main", "Cufere și Oracol"],
  ["event", "Ora Umbrelor"],
  ["boss", "Dragonul Stins"],
  ["trader", "Negustorul"],
  ["eventTop", "Top Ora Umbrelor"],
  ["bossTop", "Top Dragonul Stins"],
  ["council", "Consiliul Umbrelor"],
  ["fratia", "Chivotul Frăției"],
] as const;

const channelFields: { key: string; label: string; description: string; icon: any }[] = [
  { key: 'main', label: 'Cufere și Oracol', description: 'Recompense, chei și mesajele Oracolului', icon: Radio },
  { key: 'event', label: 'Ora Umbrelor', description: 'Anunțuri și rezultate pentru eveniment', icon: Clock3 },
  { key: 'boss', label: 'Dragonul Stins', description: 'Lupte, damage și clasament de boss', icon: ShieldCheck },
  { key: 'trader', label: 'Negustorul', description: 'Oferte și rotația comerciantului', icon: Settings2 },
  { key: 'eventTop', label: 'Top Ora Umbrelor', description: 'Clasamentul ultimului eveniment', icon: Activity },
  { key: 'bossTop', label: 'Top Dragonul Stins', description: 'Clasamentul permanent de boss', icon: Activity },
  { key: 'council', label: 'Consiliul Umbrelor', description: 'Comenzi administrative și audit', icon: LockKeyhole },
  { key: 'fratia', label: 'Chivotul Frăției', description: 'Mesaje și alerte pentru frăție', icon: Users },
];

const PROVISIONING_CATEGORIES = [
  {
    key: "gameplay",
    label: "Joc și evenimente",
    description: "Cufere, Oracol, lupte, boss, negustor și clasamente.",
    items: ["Cufere și Oracol", "Ora Umbrelor", "Dragonul Stins", "Negustorul", "Clasamente"],
  },
  {
    key: "admin",
    label: "Administrator",
    description: "Consiliu, Frăție, audit și categoriile de tichete.",
    items: ["Consiliul Umbrelor", "Chivotul Frăției", "Tichete", "Audit"],
  },
  {
    key: "filtered",
    label: "Mesaje filtrate",
    description: "Jurnale pentru anti-spam și moderarea AI.",
    items: ["Jurnal anti-spam", "Jurnal moderare AI"],
  },
  {
    key: "links",
    label: "Linkuri",
    description: "Categorie pregătită pentru canalele de filtrare linkuri.",
    items: ["Categorie Linkuri"],
  },
  {
    key: "security",
    label: "Securitate",
    description: "Alerte anti-raid și comportament suspect.",
    items: ["Alerte anti-raid", "Alerte comportament suspect"],
  },
  {
    key: "verification",
    label: "Verificare",
    description: "Canalul pentru verificarea membrilor.",
    items: ["Canal verificare"],
  },
] as const;

const DEFAULT_CHANNEL_PERMISSION: ChannelPermissionConfig = {
  roleIds: [],
  readMessageHistory: true,
  sendMessages: true,
};
const ROLE_PRESETS = [
  { key: "visitor", label: "Vizitator", match: /vizitator|visitor/i, history: true, send: false },
  { key: "member", label: "Membru", match: /membru|member/i, history: true, send: true },
  { key: "moderator", label: "Moderator", match: /moderator|moderator/i, history: true, send: true },
  { key: "administrator", label: "Administrator", match: /administrator|admin/i, history: true, send: true },
] as const;

const TICKET_CATEGORIES = [
  ["staff", "Aplicare staff"],
  ["partnership", "Parteneriate"],
  ["help_report", "Ajutor / raportare"],
] as const;

const FLOW_KINDS = [
  ["staff", "Aplicare staff"],
  ["partnership", "Parteneriate"],
  ["help_report", "Ajutor / raportare"],
] as const;

const DEFAULT_GAMEPLAY_MESSAGES = {
  gamePaused: "⏸️ Jocul este oprit momentan. Un administrator îl poate reporni cu `/startjoc`.",
  oraclePaused: "🛑 Oracle AI este oprit momentan. Un administrator îl poate reporni cu `/startai`.",
  gamePausedImageUrl: "",
  gamePausedThumbnailUrl: "",
  oraclePausedImageUrl: "",
  oraclePausedThumbnailUrl: "",
} as const;

const DEFAULT_MEMBER_MESSAGES = {
  welcomeEnabled: false,
  leaveEnabled: false,
  channelId: "",
  style: "normal",
  customStyle: "",
} as const;

const MEMBER_MESSAGE_STYLES = [
  ["medieval", "Medieval"],
  ["normal", "Normal"],
  ["fantasy", "Fantasy"],
  ["sci_fi", "Science-fiction"],
  ["humorous", "Amuzant"],
  ["custom", "Temă personalizată"],
] as const;

const DEFAULT_DAILY_STATS = {
  channelId: "",
  title: "📊 Statistici Zilnice · {guild}",
  description: "O privire asupra comunității pentru **{date}**.\n\nDatele sunt colectate de Oracolul Cenușii și sunt aceleași cu raportul de pe site.",
  color: "#7c3aed",
  footer: "Oracolul Cenușii · Community Insights",
  activityTitle: "📈 Activitate · ultimele 7 zile",
  channelsTitle: "🔥 Top 5 canale active",
  emptyChannelsText: "Încă nu există mesaje înregistrate pentru această zi.",
  imageUrl: "",
  thumbnailUrl: "",
  metricLabels: {
    messages: "💬 Mesaje",
    uniqueUsers: "👥 Utilizatori unici",
    boosts: "🚀 Boost-uri",
    joins: "🟢 Intrări",
    leaves: "🔴 Ieșiri",
    peakVoice: "🔊 Vârf vocal",
  },
} as const;

const DAILY_STATS_PREVIEW_VALUES: Record<string, string> = {
  guild: "Regatul Cenușii",
  date: "18 septembrie 2026",
  messages: "307",
  uniqueUsers: "13",
  boosts: "0",
  joins: "5",
  leaves: "5",
  peakVoice: "4",
};

const DAILY_STATS_PREVIEW_ACTIVITY = [
  { day: "2026-09-12", messages: 48 },
  { day: "2026-09-13", messages: 83 },
  { day: "2026-09-14", messages: 61 },
  { day: "2026-09-15", messages: 119 },
  { day: "2026-09-16", messages: 94 },
  { day: "2026-09-17", messages: 176 },
  { day: "2026-09-18", messages: 307 },
];

const DAILY_STATS_PREVIEW_CHANNELS = [
  { name: "general", messages: 124 },
  { name: "strategii", messages: 83 },
  { name: "raiduri", messages: 61 },
  { name: "ajutor", messages: 22 },
  { name: "off-topic", messages: 17 },
];

const DAILY_STATS_PREVIEW_METRIC_ROWS = [
  [["messages", 307], ["uniqueUsers", 13]],
  [["boosts", 0], ["joins", 5]],
  [["leaves", 5], ["peakVoice", 4]],
] as const;

function renderDailyStatsPreviewText(template: string): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => DAILY_STATS_PREVIEW_VALUES[key] ?? match);
}

const NEW_QUESTION = {
  key: "question",
  label: "Întrebare nouă",
  description: "Scrie întrebarea la care trebuie să răspundă membrul.",
  placeholder: "Scrie răspunsul tău...",
  multiline: true,
  required: true,
};

function getDuplicateQuestionKeys(flow: TicketFlowConfig): string[] {
  const counts = new Map<string, number>();
  for (const question of flow.questions) {
    const key = question.key.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
}

function isCategory(type: number | string): boolean {
  return String(type) === "4" || type === "GuildCategory";
}

function isTextChannel(type: number | string): boolean {
  return String(type) === "0" || type === "GuildText";
}

const PARTNERSHIP_PREVIEW_KEYS = [
  "server_name",
  "representative",
  "invite",
  "members",
  "description",
  "motivation",
  "offer",
  "terms",
] as const;

function previewValue(value: string | undefined, fallback = "—"): string {
  return value?.trim() || fallback;
}

function partnershipPreviewAnswers(
  flow: TicketFlowConfig,
  answers: Record<string, string>,
): Record<string, string> {
  const orderedAnswers = flow.questions
    .map((question) => answers[question.key])
    .filter((value): value is string => Boolean(value?.trim()));
  return Object.fromEntries(
    PARTNERSHIP_PREVIEW_KEYS.map((key, index) => [
      key,
      answers[key] ?? orderedAnswers[index] ?? "—",
    ]),
  );
}

function renderAnnouncementTemplate(
  template: string,
  answers: Record<string, string>,
): string {
  const values: Record<string, string> = {
    ...answers,
    applicant: "Membrul care testează",
    applicant_mention: "@Membrul care testează",
    members_total: answers.members_total ?? "150",
    members_online: answers.members_online ?? "60",
  };
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => values[key] ?? match);
}

export function BotControlPage() {
  const [location, setLocation] = useLocation();
  const { guildId } = useActiveGuild();
  const { data, loading, error, update, provisionChannels } = useBotControl(guildId);
  const [inviteRange, setInviteRange] = useState<InviteStatsRange>("7");
  const {
    data: inviteStats,
    loading: inviteStatsLoading,
    syncing: inviteStatsSyncing,
    error: inviteStatsError,
    sync: syncInviteStats,
  } = useInviteStats(guildId, inviteRange);
  const { data: metadata, refetch: refetchMetadata } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const { session } = useSession();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionConfirmOpen, setProvisionConfirmOpen] = useState(false);
  const [selectedProvisioningCategories, setSelectedProvisioningCategories] = useState<string[]>(
    PROVISIONING_CATEGORIES.map((category) => category.key),
  );
  const [provisioningPermissions, setProvisioningPermissions] = useState<Record<string, ChannelPermissionConfig>>(
    () => Object.fromEntries(PROVISIONING_CATEGORIES.map((category) => [
      category.key,
      { ...DEFAULT_CHANNEL_PERMISSION, roleIds: [] },
    ])),
  );
  const [activeFlowKind, setActiveFlowKind] = useState<keyof BotControlConfig["tickets"]["flows"]>("staff");
  const [testOpen, setTestOpen] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [testCompleted, setTestCompleted] = useState(false);
  const [testStep, setTestStep] = useState(0);
  const [testDraftAnswer, setTestDraftAnswer] = useState("");
  const [testAnswers, setTestAnswers] = useState<Record<string, string>>({});
  const [testError, setTestError] = useState("");
  const searchString = useSearch();
  const requestedTab = new URLSearchParams(searchString || location.split("?")[1] || "").get("tab");
  const [activeTab, setActiveTab] = useState<BotControlTab>(
    requestedTab && BOT_CONTROL_TABS.includes(requestedTab as BotControlTab)
      ? requestedTab as BotControlTab
      : "channels",
  );
  const [expandedCategory, setExpandedCategory] = useState<string | null>("gameplay");
  const initializedGuild = React.useRef<string | null>(null);
  const currentGuild = React.useRef(guildId);
  currentGuild.current = guildId;

  useEffect(() => {
    if (!guildId) {
      initializedGuild.current = null;
      setDraft(null);
      return;
    }
    if (initializedGuild.current && initializedGuild.current !== guildId && !data) {
      initializedGuild.current = null;
      setDraft(null);
    }
    if (data && initializedGuild.current !== guildId) {
      initializedGuild.current = guildId;
      setDraft(JSON.parse(JSON.stringify(data)));
      setProvisioningPermissions(JSON.parse(JSON.stringify(data.provisioningPermissions ?? {})));
    }
  }, [data, guildId]);

  useEffect(() => {
    if (requestedTab === "verification") {
      setLocation("/verificare");
      return;
    }
    if (requestedTab && BOT_CONTROL_TABS.includes(requestedTab as BotControlTab)) {
      setActiveTab(requestedTab as BotControlTab);
    }
  }, [requestedTab, setLocation]);

  const currentDraft = initializedGuild.current === guildId && data ? draft : null;
  const hasUnsavedChanges = Boolean(
    data && currentDraft && (
      JSON.stringify(currentDraft) !== JSON.stringify(data) ||
      JSON.stringify(provisioningPermissions) !== JSON.stringify(data.provisioningPermissions ?? {})
    ),
  );

  const setChannel = (key: string, value: string) => {
    setDraft((current) => current ? {
      ...current,
      channels: { ...current.channels, [key]: value === "__none__" ? "" : value },
    } : current);
  };

  const setProvisioningPermission = (
    categoryKey: string,
    change: Partial<ChannelPermissionConfig>,
  ) => {
    setProvisioningPermissions((current) => ({
      ...current,
      [categoryKey]: {
        ...(current[categoryKey] ?? DEFAULT_CHANNEL_PERMISSION),
        ...change,
      },
    }));
  };

  const toggleProvisioningRole = (categoryKey: string, roleId: string, checked: boolean) => {
    const current = provisioningPermissions[categoryKey] ?? DEFAULT_CHANNEL_PERMISSION;
    const roleIds = checked
      ? Array.from(new Set([...current.roleIds, roleId]))
      : current.roleIds.filter((id) => id !== roleId);
    const rolePermissions = { ...(current.rolePermissions ?? {}) };
    if (checked) {
      rolePermissions[roleId] ??= {
        viewChannel: true,
        readMessageHistory: current.readMessageHistory,
        sendMessages: current.sendMessages,
      };
    } else {
      delete rolePermissions[roleId];
    }
    setProvisioningPermission(categoryKey, { roleIds, rolePermissions });
  };

  const applyRolePreset = (categoryKey: string, presetKey: string) => {
    const preset = ROLE_PRESETS.find((candidate) => candidate.key === presetKey);
    if (!preset || !metadata) return;
    const role = preset.key === "visitor"
      ? metadata.roles.find((candidate) => candidate.id === metadata.guild.id)
      : metadata.roles.find((candidate) => preset.match.test(candidate.name));
    if (!role) {
      toast({
        variant: "destructive",
        title: `Nu am găsit rolul pentru ${preset.label}`,
        description: "Alege un rol existent din listă sau creează-l în Discord și reîncarcă pagina.",
      });
      return;
    }
    setProvisioningPermission(categoryKey, {
      roleIds: [role.id],
      readMessageHistory: preset.history,
      sendMessages: preset.send,
      rolePermissions: {
        [role.id]: {
          viewChannel: true,
          readMessageHistory: preset.history,
          sendMessages: preset.send,
        },
      },
    });
  };

  const setTicket = (path: string[], value: string | number) => {
    setDraft((current) => {
      if (!current) return current;
      const tickets = JSON.parse(JSON.stringify(current.tickets));
      let target: any = tickets;
      path.slice(0, -1).forEach((part) => { target = target[part]; });
      target[path[path.length - 1]] = value;
      return { ...current, tickets };
    });
  };

  const setGameplayMessage = (field: keyof BotControlConfig["gameplayConfig"]["messages"], value: string) => {
    setDraft((current) => current ? {
      ...current,
      gameplayConfig: {
        ...current.gameplayConfig,
        messages: { ...current.gameplayConfig.messages, [field]: value },
      },
    } : current);
  };

  function setMemberMessage<K extends keyof BotControlConfig["gameplayConfig"]["memberMessages"]>(
    field: K,
    value: BotControlConfig["gameplayConfig"]["memberMessages"][K],
  ) {
    setDraft((current) => current ? {
      ...current,
      gameplayConfig: {
        ...current.gameplayConfig,
        memberMessages: { ...current.gameplayConfig.memberMessages, [field]: value },
      },
    } : current);
  }

  const setDailyStats = (field: keyof Omit<BotControlConfig["dailyStats"], "metricLabels">, value: string) => {
    setDraft((current) => current ? {
      ...current,
      dailyStats: { ...current.dailyStats, [field]: value },
    } : current);
  };

  const setDailyStatsMetric = (
    field: keyof BotControlConfig["dailyStats"]["metricLabels"],
    value: string,
  ) => {
    setDraft((current) => current ? {
      ...current,
      dailyStats: {
        ...current.dailyStats,
        metricLabels: { ...current.dailyStats.metricLabels, [field]: value },
      },
    } : current);
  };

  const setInviteTracking = <K extends keyof BotControlConfig["inviteTracking"]>(
    field: K,
    value: BotControlConfig["inviteTracking"][K],
  ) => {
    setDraft((current) => current ? {
      ...current,
      inviteTracking: { ...current.inviteTracking, [field]: value },
    } : current);
  };

  const resetGameplayMessages = () => {
    setDraft((current) => current ? {
      ...current,
      gameplayConfig: {
        ...current.gameplayConfig,
        messages: { ...DEFAULT_GAMEPLAY_MESSAGES },
      },
    } : current);
  };

  const resetMemberMessages = () => {
    setDraft((current) => current ? {
      ...current,
      gameplayConfig: {
        ...current.gameplayConfig,
        memberMessages: { ...DEFAULT_MEMBER_MESSAGES },
      },
    } : current);
  };

  const resetDailyStats = () => {
    setDraft((current) => current ? {
      ...current,
      dailyStats: {
        ...DEFAULT_DAILY_STATS,
        metricLabels: { ...DEFAULT_DAILY_STATS.metricLabels },
      },
    } : current);
  };

  const setFlow = (kind: keyof BotControlConfig["tickets"]["flows"], field: keyof TicketFlowConfig, value: string) => {
    setDraft((current) => current ? {
      ...current,
      tickets: {
        ...current.tickets,
        flows: {
          ...current.tickets.flows,
          [kind]: { ...current.tickets.flows[kind], mode: "custom", [field]: value },
        },
      },
    } : current);
  };

  const setPostedQuestion = (
    kind: keyof BotControlConfig["tickets"]["flows"],
    key: string,
    included: boolean,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      const selected = flow.postedQuestionKeys ?? flow.questions.map((question) => question.key);
      const postedQuestionKeys = included
        ? Array.from(new Set([...selected, key]))
        : selected.filter((selectedKey) => selectedKey !== key);
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, mode: "custom", postedQuestionKeys } },
        },
      };
    });
  };

  const updateQuestion = (
    kind: keyof BotControlConfig["tickets"]["flows"],
    index: number,
    field: string,
    value: string | boolean,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      const previousKey = flow.questions[index]?.key;
      const questions = flow.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [field]: value } : question,
      );
      const currentPostedKeys = flow.postedQuestionKeys ?? flow.questions.map((question) => question.key);
      const postedQuestionKeys = field === "key" && typeof value === "string"
        ? currentPostedKeys.map((key) => key === previousKey ? value : key)
        : currentPostedKeys.filter((key) => questions.some((question) => question.key === key));
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, questions, postedQuestionKeys } },
        },
      };
    });
  };

  const addQuestion = (kind: keyof BotControlConfig["tickets"]["flows"]) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      const suffix = flow.questions.length + 1;
      const question = { ...NEW_QUESTION, key: `question_${suffix}` };
      const postedQuestionKeys = [...(flow.postedQuestionKeys ?? flow.questions.map((entry) => entry.key)), question.key];
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, mode: "custom", questions: [...flow.questions, question], postedQuestionKeys } },
        },
      };
    });
  };

  const removeQuestion = (kind: keyof BotControlConfig["tickets"]["flows"], index: number) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      if (flow.questions.length <= 1) return current;
      const removedKey = flow.questions[index]?.key;
      const postedQuestionKeys = (flow.postedQuestionKeys ?? flow.questions.map((entry) => entry.key))
        .filter((key) => key !== removedKey);
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, mode: "custom", questions: flow.questions.filter((_, questionIndex) => questionIndex !== index), postedQuestionKeys } },
        },
      };
    });
  };

  const moveQuestion = (kind: keyof BotControlConfig["tickets"]["flows"], index: number, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      const target = index + direction;
      if (target < 0 || target >= flow.questions.length) return current;
      const questions = [...flow.questions];
      [questions[index], questions[target]] = [questions[target]!, questions[index]!];
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, mode: "custom", questions } },
        },
      };
    });
  };

  const save = async () => {
    if (!currentDraft || !hasUnsavedChanges || saving || provisioning) return;
    const submittedGuild = guildId;
    const submittedDraft = currentDraft;
    const submittedPermissions = provisioningPermissions;
    const duplicateFlow = Object.entries(submittedDraft.tickets.flows)
      .map(([kind, flow]) => ({ kind, flow, duplicateKeys: getDuplicateQuestionKeys(flow) }))
      .find(({ duplicateKeys }) => duplicateKeys.length > 0);
    if (duplicateFlow) {
      const flowLabel = FLOW_KINDS.find(([kind]) => kind === duplicateFlow.kind)?.[1] ?? duplicateFlow.kind;
      toast({
        variant: "destructive",
        title: "Salvarea a fost blocată",
        description: `Fluxul „${flowLabel}” are chei duplicate: ${duplicateFlow.duplicateKeys.join(", ")}. Schimbă cheile înainte de salvare.`,
      });
      return;
    }
    setSaving(true);
    try {
      const flows = Object.fromEntries(
        Object.entries(submittedDraft.tickets.flows).map(([kind, flow]) => [kind, { ...flow, mode: "custom" }]),
      ) as BotControlConfig["tickets"]["flows"];
      const saved = await update({
        ...submittedDraft,
        provisioningPermissions: submittedPermissions,
        channels: Object.fromEntries(Object.entries(submittedDraft.channels).filter(([, value]) => value)),
        tickets: { ...submittedDraft.tickets, flows },
      });
      if (currentGuild.current !== submittedGuild || initializedGuild.current !== submittedGuild) return;
      setDraft((current) => rebaseDraftChanges(structuredClone(saved), submittedDraft, current));
      setProvisioningPermissions((current) => rebaseDraftChanges(
        structuredClone(saved.provisioningPermissions ?? {}), submittedPermissions, current,
      ));
      toast(saved.discordLive
        ? {
            title: "Setările au fost salvate",
            description: "Botul este conectat. Verifică destinațiile și postările Discord; conectarea nu confirmă livrarea fiecărui mesaj.",
          }
        : {
            variant: "destructive",
            title: "Salvate, dar botul Discord este offline",
            description: "Valorile sunt persistente și vor fi încărcate când botul se reconectează.",
          });
    } catch (saveError: any) {
      if (currentGuild.current !== submittedGuild) return;
      toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message ?? "Încearcă din nou." });
    } finally {
      setSaving(false);
    }
  };

  const provision = async () => {
    if (saving || provisioning) return;
    if (hasUnsavedChanges) {
      toast({
        variant: "destructive",
        title: "Salvează sau renunță mai întâi la draft",
        description: "Provisioningul reîncarcă setările persistente și nu trebuie să suprascrie modificările nesalvate.",
      });
      return;
    }
    if (selectedProvisioningCategories.length === 0) {
      toast({
        variant: "destructive",
        title: "Alege cel puțin o categorie",
        description: "Bifează în partea dreaptă ce vrei să creezi.",
      });
      return;
    }
    const submittedGuild = guildId;
    setProvisionConfirmOpen(false);
    setProvisioning(true);
    try {
      const permissions = Object.fromEntries(
        selectedProvisioningCategories.map((key) => [key, provisioningPermissions[key] ?? DEFAULT_CHANNEL_PERMISSION]),
      );
      const saved = await provisionChannels(selectedProvisioningCategories, permissions);
      if (currentGuild.current !== submittedGuild) return;
      setDraft(JSON.parse(JSON.stringify(saved)));
      setProvisioningPermissions(structuredClone(saved.provisioningPermissions ?? {}));
      await refetchMetadata();
      const created = saved.provisioning?.created.length ?? 0;
      const reused = saved.provisioning?.reused.length ?? 0;
      toast({
        title: "Canalele au fost sincronizate",
        description: `${created} create, ${reused} reutilizate pentru ${selectedProvisioningCategories.length} categorii. Configurația a fost salvată pentru acest server.`,
      });
    } catch (provisionError: any) {
      if (currentGuild.current !== submittedGuild) return;
      toast({
        variant: "destructive",
        title: "Provisioningul a eșuat",
        description: provisionError?.message ?? "Verifică permisiunea Manage Channels și încearcă din nou.",
      });
    } finally {
      setProvisioning(false);
    }
  };

  if ((loading || (data && initializedGuild.current !== guildId)) && !currentDraft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!draft || !currentDraft) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">{error?.message ?? "Setările botului nu au putut fi încărcate."}</div>;
  }

  const categories = metadata?.channels.filter((channel) => isCategory(channel.type)) ?? [];
  const textChannels = metadata?.channels.filter((channel) => isTextChannel(channel.type)) ?? [];
  const memberMessageChannelId = draft?.gameplayConfig.memberMessages.channelId ?? "";
  const selectedMemberMessageChannel = textChannels.some((channel) => channel.id === memberMessageChannelId)
    ? memberMessageChannelId
    : memberMessageChannelId ? "__manual__" : "__none__";
  const permissionRoles = (metadata?.roles ?? [])
    .filter((role) => !role.managed || role.id === metadata?.guild.id)
    .sort((left, right) => (right.position ?? 0) - (left.position ?? 0));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const activeFlow = draft.tickets.flows[activeFlowKind];
  const duplicateQuestionKeys = getDuplicateQuestionKeys(activeFlow);
  const activeCategory = draft.tickets.categories[activeFlowKind];
  const selectedActiveCategory = categories.some((category) => category.id === activeCategory)
    ? activeCategory
    : "__manual__";
  const postedQuestionKeys = new Set(
    activeFlow.postedQuestionKeys ?? activeFlow.questions.map((question) => question.key),
  );
  const testQuestion = activeFlow.questions[testStep];
  const partnershipAnswers = activeFlowKind === "partnership"
    ? partnershipPreviewAnswers(activeFlow, testAnswers)
    : null;
  const partnershipAnnouncement = partnershipAnswers
    ? renderAnnouncementTemplate(
      draft.tickets.allianceAnnouncementTemplate,
      partnershipAnswers,
    )
    : "";
  const resetFlowTest = () => {
    setTestStarted(false);
    setTestCompleted(false);
    setTestStep(0);
    setTestDraftAnswer("");
    setTestAnswers({});
    setTestError("");
  };
  const openFlowTest = () => {
    resetFlowTest();
    setTestOpen(true);
  };
  const submitTestAnswer = () => {
    if (!testQuestion) return;
    const answer = testDraftAnswer.trim();
    if (testQuestion.required && !answer) {
      setTestError("Răspunsul este obligatoriu pentru această întrebare.");
      return;
    }
    const nextAnswers = { ...testAnswers, [testQuestion.key]: answer || "—" };
    setTestAnswers(nextAnswers);
    setTestError("");
    setTestDraftAnswer("");
    if (testStep >= activeFlow.questions.length - 1) {
      setTestCompleted(true);
    } else {
      setTestStep((step) => step + 1);
    }
  };

  return (
    <div className={`bot-control-page max-w-5xl space-y-6 animate-stagger-1 ${hasUnsavedChanges ? "pb-28" : ""}`}>
      <header className="bot-control-hero animate-stagger-2">
        <div>
          <div className="bot-control-brand-row">
            <span className="bot-control-brand-mark"><Bot className="h-4 w-4" /></span>
            <p className="mod-eyebrow">CONTROL OWNER-ONLY</p>
          </div>
          <h1 className="mod-heading text-4xl">Control bot</h1>
          <p>Configurează destinațiile Discord și regulile de creare fără să pierzi din vedere ce se schimbă.</p>
        </div>
        <div className="bot-control-status" data-state={draft.discordLive === true ? "online" : "offline"}>
          <span className="bot-control-status-dot" />
          <div>
            <strong>{draft.discordLive === true ? "Bot conectat" : "Bot deconectat"}</strong>
            <small>{draft.discordLive === true ? "Setările pot fi sincronizate pe Discord" : "Salvarea rămâne disponibilă local"}</small>
          </div>
        </div>
      </header>

      {draft.discordLive === false && (
        <div className="bot-control-banner animate-stagger-3" role="status">
          <AlertTriangle className="shrink-0" size={15} />
          <div>
            <strong>Modificările rămân în așteptare.</strong>{" "}
            Botul Discord nu este conectat la această instanță. Salvarea este disponibilă acum, iar setările devin active după reconectare.
          </div>
          <button
            type="button"
            onClick={() => toast({ title: "Botul este offline", description: "Poți salva setările acum; botul le va aplica după reconectare." })}
            className="bot-control-banner-help"
            data-testid="button-view-connection-help"
          >
            <CircleHelp size={13} /> Detalii
          </button>
        </div>
      )}
      <div className="animate-stagger-4">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (!BOT_CONTROL_TABS.includes(value as BotControlTab)) return;
            const nextTab = value as BotControlTab;
            setActiveTab(nextTab);
            setLocation(`/bot?tab=${nextTab}`);
          }}
          className="bot-control-tabs space-y-5"
        >
             <TabsList className="bot-control-tab-list grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/80 p-1 sm:grid-cols-5 bg-background/50 shadow-inner">
             <TabsTrigger value="channels" data-testid="tab-channels" className="mod-tab-trigger gap-2 py-2.5"><Radio className="h-4 w-4" /> Canale</TabsTrigger>
              <TabsTrigger value="roles" data-testid="tab-roles" className="mod-tab-trigger gap-2 py-2.5"><Users className="h-4 w-4" /> Roluri</TabsTrigger>
             <TabsTrigger value="tickets" data-testid="tab-tickets" className="mod-tab-trigger gap-2 py-2.5"><Ticket className="h-4 w-4" /> Tichete</TabsTrigger>
           <TabsTrigger value="messages" data-testid="tab-messages" className="mod-tab-trigger gap-2 py-2.5"><Megaphone className="h-4 w-4" /> Mesaje</TabsTrigger>
           <TabsTrigger value="statistics" data-testid="tab-statistics" className="mod-tab-trigger gap-2 py-2.5"><Activity className="h-4 w-4" /> Statistici</TabsTrigger>
        </TabsList>

          <TabsContent value="roles" className="mod-tab-content mt-0">
            <section className="surface role-presets-surface space-y-4">
              <div className="section-head">
                <div>
                  <h2 className="font-medium text-foreground">Presetări de rol</h2>
                  <p className="text-xs text-muted-foreground">Pornește cu setări uzuale, apoi ajustează permisiunile fiecărui rol pe categorii în secțiunea Canale.</p>
                </div>
              </div>
              <div className="role-presets-grid">
                {ROLE_PRESETS.map((preset) => {
                  const role = preset.key === "visitor"
                    ? metadata?.roles.find((candidate) => candidate.id === metadata.guild.id)
                    : metadata?.roles.find((candidate) => preset.match.test(candidate.name));
                  const applyPreset = () => {
                    if (!role) return;
                    setProvisioningPermissions((current) => Object.fromEntries(
                      PROVISIONING_CATEGORIES.map(({ key }) => {
                        const permission = current[key] ?? DEFAULT_CHANNEL_PERMISSION;
                        const roleIds = Array.from(new Set([...permission.roleIds, role.id]));
                        return [key, {
                          ...permission,
                          roleIds,
                          rolePermissions: {
                            ...(permission.rolePermissions ?? {}),
                            [role.id]: {
                              viewChannel: true,
                              readMessageHistory: preset.history,
                              sendMessages: preset.send,
                            },
                          },
                        }];
                      }),
                    ));
                    toast({
                      title: `Presetarea ${preset.label} a fost aplicată`,
                      description: "Setările sunt pregătite pentru toate categoriile. Apasă Salvează controlul botului, apoi sincronizează categoriile dorite.",
                    });
                  };
                  return (
                    <article className="role-preset-card" key={preset.key}>
                      <div className="role-preset-heading">
                        <span className="icon-box amber"><Users size={15} /></span>
                        <div><h3>{preset.label}</h3><p>{role ? `Rol Discord: ${preset.key === "visitor" ? "@everyone" : `@${role.name}`}` : "Rolul nu a fost găsit pe server"}</p></div>
                      </div>
                      <ul>
                        <li>Poate vedea canalele: Da</li>
                        <li>Poate vedea istoricul: {preset.history ? "Da" : "Nu"}</li>
                        <li>Poate scrie mesaje: {preset.send ? "Da" : "Nu"}</li>
                      </ul>
                      <Button type="button" variant="outline" className="w-full" disabled={!role} onClick={applyPreset}>
                        Aplică pe toate categoriile
                      </Button>
                    </article>
                  );
                })}
              </div>
              <p className="role-presets-note">Presetările modifică doar draftul până îl salvezi. Pentru a activa accesul în Discord, sincronizează apoi categoriile din fila Canale.</p>
            </section>
          </TabsContent>

         <TabsContent value="channels" className="mod-tab-content mt-0">
<div className="content-grid">
            <div className="left-stack">
              <section className="surface channel-list">
                <div className="section-head">
                  <div>
                    <h2 className="font-medium text-foreground">Identifică destinațiile pe Discord</h2>
                    <p className="text-xs text-muted-foreground">Selectează canale din server pentru fiecare funcție a botului.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-2 h-8 text-xs"
                    onClick={() => void refetchMetadata()}
                  >
                    <Radio className="h-3 w-3" /> Reîmprospătează
                  </Button>
                </div>
                <div className="channel-grid">
                  {channelFields.map(({ key, label, description, icon: Icon }) => {
                    const current = draft.channels[key] ?? "";
                    const selected = metadata?.channels.some((channel) => channel.id === current) ? current : "__none__";
                    return (
                      <article className="channel-card" key={key}>
                        <div className="channel-card-head">
                          <Icon size={14} />
                          <div>
                            <h3>{label}</h3>
                            <p>{description}</p>
                          </div>
                        </div>
                        <div className="channel-input">
                          <Select value={selected} onValueChange={(value) => setChannel(key, value)}>
                            <SelectTrigger className="border-0 h-auto p-0 bg-transparent focus:ring-0 shadow-none text-xs w-auto">
                              <SelectValue placeholder="Alege canal" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                              <SelectItem value="__none__">Neconfigurat</SelectItem>
                              {metadata?.channels.map((channel) => (
                                <SelectItem key={channel.id} value={channel.id}>
                                  {isCategory(channel.type) ? "▰" : "#"} {channel.name}
                                  {channel.parentId && categoryNames.get(channel.parentId) ? ` · ${categoryNames.get(channel.parentId)}` : ""}
                                  {" "}({channel.id})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <input
                            type="text"
                            value={current}
                            onChange={(e) => setChannel(key, e.target.value.trim())}
                            placeholder="ID canal Discord"
                            aria-label={`${label} ID`}
                          />
                          <span>{current ? `#${metadata?.channels.find(c => c.id === current)?.name ?? "Manual"}` : 'ID manual'}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="surface permissions">
                <div className="section-title">
                  <span className="icon-box amber"><ShieldCheck size={16} /></span>
                  <div>
                    <h2>Permisiuni necesare</h2>
                    <p>Verifică accesul botului înainte de provisioning pentru a evita categorii create incomplet.</p>
                  </div>
                </div>
                <div className="permission-summary">
                  <span>Manage Channels {metadata?.botCapabilities?.canManageChannels ? <em>✓ Disponibilă</em> : <b>⚠ Necesară</b>}</span>
                  <span>Suprascrieri de acces {metadata?.botCapabilities?.canManageChannels ? <em>✓ Se aplică automat</em> : <b>⚠ Necesită Manage Channels</b>}</span>
                  <span>Mesaje și istoric <em>Configurabile pe categorie</em></span>
                </div>
                <p className="help">
                  <CircleHelp size={13} />
                  <span>
                    <strong>Manage Permissions</strong> nu este o permisiune Discord separată. Botul folosește <strong>Manage Channels</strong> pentru a crea canalele și a aplica accesul; <strong>Mesaje și istoric</strong> se aleg mai jos pentru fiecare categorie și rol.
                  </span>
                </p>
              </section>
            </div>

            <aside className="provision-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">PROVISIONING</span>
                  <h2>Ce se creează</h2>
                </div>
                <span className="count-pill">{selectedProvisioningCategories.length}/{PROVISIONING_CATEGORIES.length}</span>
              </div>
              <p>Selectează doar categoriile pe care botul are voie să le pregătească. Celelalte nu sunt atinse.</p>
              <div className="category-list">
                {PROVISIONING_CATEGORIES.map((category) => {
                  const isSelected = selectedProvisioningCategories.includes(category.key);
                  const open = expandedCategory === category.key;
                  const permission = provisioningPermissions[category.key] ?? DEFAULT_CHANNEL_PERMISSION;
                  return (
                    <div className={`category-row ${isSelected ? 'selected' : ''}`} key={category.key}>
                      <div className="category-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            setSelectedProvisioningCategories(e.target.checked
                              ? [...selectedProvisioningCategories, category.key]
                              : selectedProvisioningCategories.filter((k) => k !== category.key));
                            if (e.target.checked) setExpandedCategory(category.key);
                          }}
                        />
                        <button type="button" onClick={() => setExpandedCategory(open ? null : category.key)}>
                          <Folder size={13} /> <strong>{category.label}</strong>
                          <small>{category.items.length} destinații · {category.description}</small>
                        </button>
                        <ChevronDown size={13} className={open ? 'rotate' : ''} />
                      </div>
                      {open && isSelected && (
                        <div className="category-details">
                          <div className="item-tags">
                            {category.items.map((item) => <span key={item}>{item}</span>)}
                          </div>

                          <div className="permission-panel">
                            <div className="permission-title">
                              <LockKeyhole size={15} />
                              <div>
                                <strong>Permisiuni pentru {category.label}</strong>
                                <p>Permisiunile de mai jos se aplică rolurilor alese; suprascrierile Discord pentru celelalte roluri sunt păstrate.</p>
                              </div>
                            </div>
                            <div className="role-grid">
                              {permissionRoles.length > 0 ? permissionRoles.map((role) => {
                                const roleAccess = permission.rolePermissions?.[role.id] ?? {
                                  viewChannel: permission.roleIds.includes(role.id),
                                  readMessageHistory: permission.readMessageHistory,
                                  sendMessages: permission.sendMessages,
                                };
                                return (
                                <div className="permission-role-row" key={role.id}>
                                  <label className="permission-check">
                                    <input
                                      type="checkbox"
                                      checked={permission.roleIds.includes(role.id)}
                                      onChange={(event) => toggleProvisioningRole(category.key, role.id, event.target.checked)}
                                    />
                                    <Users size={12} /> <span className="truncate">{role.id === metadata?.guild.id ? "@everyone · implicit" : `@${role.name}`}</span>
                                  </label>
                                  {permission.roleIds.includes(role.id) && (
                                    <div className="permission-role-options">
                                      <label><input type="checkbox" aria-label={`${role.name}: poate vedea`} checked={roleAccess.viewChannel} onChange={(event) => setProvisioningPermission(category.key, { rolePermissions: { ...(permission.rolePermissions ?? {}), [role.id]: { ...roleAccess, viewChannel: event.target.checked } } })} /> Vede</label>
                                      <label><input type="checkbox" aria-label={`${role.name}: poate vedea istoricul`} checked={roleAccess.readMessageHistory} onChange={(event) => setProvisioningPermission(category.key, { rolePermissions: { ...(permission.rolePermissions ?? {}), [role.id]: { ...roleAccess, readMessageHistory: event.target.checked } } })} /> Istoric</label>
                                      <label><input type="checkbox" aria-label={`${role.name}: poate scrie`} checked={roleAccess.sendMessages} onChange={(event) => setProvisioningPermission(category.key, { rolePermissions: { ...(permission.rolePermissions ?? {}), [role.id]: { ...roleAccess, sendMessages: event.target.checked } } })} /> Scrie</label>
                                    </div>
                                  )}
                                </div>
                                );
                              }) : (
                                <p className="text-xs text-muted-foreground col-span-2">Nu există roluri Discord disponibile.</p>
                              )}
                            </div>
                            <div className="permission-presets" aria-label={`Presetări roluri ${category.label}`}>
                              <span>Presetare rapidă</span>
                              {ROLE_PRESETS.map((preset) => (
                                <Button
                                  key={preset.key}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={() => applyRolePreset(category.key, preset.key)}
                                >
                                  {preset.label}
                                </Button>
                              ))}
                            </div>
                            <div className="permission-options">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={permission.readMessageHistory}
                                  onChange={(event) => setProvisioningPermission(category.key, { readMessageHistory: event.target.checked })}
                                />
                                Pot vedea istoricul
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={permission.sendMessages}
                                  onChange={(event) => setProvisioningPermission(category.key, { sendMessages: event.target.checked })}
                                />
                                Pot scrie mesaje
                              </label>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="panel-actions gap-2 flex-col">
                <div className="flex gap-2 w-full">
                  <Button type="button" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => setSelectedProvisioningCategories(PROVISIONING_CATEGORIES.map((c) => c.key))}>Toate</Button>
                  <Button type="button" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => setSelectedProvisioningCategories([])}>Niciuna</Button>
                </div>
                <Button
                  type="button"
                  variant="default"
                  className="w-full gap-2 mt-2"
                  onClick={() => {
                    if (hasUnsavedChanges) {
                      toast({
                        variant: "destructive",
                        title: "Salvează sau renunță mai întâi la draft",
                        description: "Setările nesalvate nu se aplică pe Discord.",
                      });
                      return;
                    }
                    if (selectedProvisioningCategories.length === 0) {
                      toast({
                        variant: "destructive",
                        title: "Alege cel puțin o categorie",
                        description: "Bifează categoriile pe care vrei să le sincronizezi.",
                      });
                      return;
                    }
                    setProvisionConfirmOpen(true);
                  }}
                  disabled={provisioning || metadata?.botCapabilities?.canManageChannels !== true}
                >
                  {provisioning ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
                  {provisioning ? "Se sincronizează…" : "Creează ce lipsește"}
                </Button>
              </div>
            </aside>
          </div>


          </TabsContent>

          <TabsContent value="tickets" className="mod-tab-content mt-0 space-y-5">
          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Ticket className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Editor flux ticket</h2>
                <p className="text-xs text-muted-foreground">
                  Configurează un singur tip de ticket de la cap la coadă: destinație, panou, răspunsuri și acțiunea finală.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
              <div>
                <p className="text-xs font-mono tracking-widest text-primary">PASUL 1 · FLUX ȘI DESTINAȚIE</p>
                <p className="mt-1 text-xs text-muted-foreground">Alege fluxul și categoria Discord în care vor fi create ticketurile.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipul de ticket</label>
                  <Select value={activeFlowKind} onValueChange={(value) => setActiveFlowKind(value as typeof activeFlowKind)}>
                    <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege tipul de tichet" /></SelectTrigger>
                    <SelectContent>
                      {FLOW_KINDS.map(([kind, label]) => <SelectItem key={kind} value={kind}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Categoria Discord</label>
                  <Select
                    value={selectedActiveCategory}
                    onValueChange={(value) => setTicket(["categories", activeFlowKind], value === "__manual__" ? activeCategory : value)}
                  >
                    <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege categoria" /></SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                      <SelectItem value="__manual__">Introduc manual ID-ul</SelectItem>
                      {categories.map((category) => <SelectItem key={category.id} value={category.id}>▰ {category.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={activeCategory}
                    aria-label="ID categorie Discord pentru fluxul activ"
                    placeholder="ID categorie Discord"
                    onChange={(event) => setTicket(["categories", activeFlowKind], event.target.value.trim())}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-mono tracking-widest text-primary">PASUL 2 · PANOU ȘI COMPORTAMENT</p>
                <p className="mt-1 text-xs text-muted-foreground">Acestea sunt mesajele și acțiunile pe care le vede membrul după ce deschide ticketul.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Titlul panoului Discord</label>
                <EmojiField value={activeFlow.title} maxLength={256} onChange={(value) => setFlow(activeFlowKind, "title", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Textul butonului de start</label>
                <EmojiField value={activeFlow.startButtonLabel} maxLength={80} onChange={(value) => setFlow(activeFlowKind, "startButtonLabel", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Acțiune după completare</label>
                <Select value={activeFlow.completionAction} onValueChange={(value) => setFlow(activeFlowKind, "completionAction", value)}>
                 <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notify_staff">Închide și anunță stafful</SelectItem>
                    <SelectItem value="lock">Închide fără mesaj staff</SelectItem>
                    <SelectItem value="keep_open">Lasă ticketul deschis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Descrierea panoului</label>
                <EmojiField multiline rows={3} maxLength={2000} value={activeFlow.panelDescription} onChange={(value) => setFlow(activeFlowKind, "panelDescription", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Ghidul afișat la „Întrebări”</label>
                <EmojiField multiline rows={3} maxLength={2000} value={activeFlow.requirementsText} onChange={(value) => setFlow(activeFlowKind, "requirementsText", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
              </div>
              <ImageField label="Imaginea panoului" value={activeFlow.panelImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setFlow(activeFlowKind, "panelImageUrl", value)} />
              <ImageField label="Thumbnail-ul panoului (dreapta sus)" value={activeFlow.panelThumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setFlow(activeFlowKind, "panelThumbnailUrl", value)} />
              <div className="space-y-2">
                <label className="text-sm font-medium">Mesajul după completare</label>
                <EmojiField multiline rows={4} maxLength={2000} value={activeFlow.completionMessage} onChange={(value) => setFlow(activeFlowKind, "completionMessage", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Mesajul pentru staff</label>
                <EmojiField multiline rows={4} maxLength={2000} value={activeFlow.staffNotificationMessage} onChange={(value) => setFlow(activeFlowKind, "staffNotificationMessage", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
              </div>
              <ImageField label="Imaginea mesajului de finalizare" value={activeFlow.completionImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setFlow(activeFlowKind, "completionImageUrl", value)} />
              <ImageField label="Thumbnail-ul mesajului de finalizare" value={activeFlow.completionThumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setFlow(activeFlowKind, "completionThumbnailUrl", value)} />
              <ImageField label="Imaginea mesajului pentru staff" value={activeFlow.staffNotificationImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setFlow(activeFlowKind, "staffNotificationImageUrl", value)} />
              <ImageField label="Thumbnail-ul mesajului pentru staff" value={activeFlow.staffNotificationThumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setFlow(activeFlowKind, "staffNotificationThumbnailUrl", value)} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-mono tracking-widest text-primary">PASUL 3 · ÎNTREBĂRI</p>
                  <h3 className="mt-1 font-medium">Întrebările ticketului ({activeFlow.questions.length}/20)</h3>
                  <p className="text-xs text-muted-foreground">Adaugă întrebările pentru categoria aleasă. Ordinea de aici este ordinea în care botul le va cere.</p>
                </div>
                <Button type="button" variant="secondary" onClick={() => addQuestion(activeFlowKind)} disabled={activeFlow.questions.length >= 20}>
                  Adaugă întrebare
                </Button>
              </div>
              {duplicateQuestionKeys.length > 0 && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Chei duplicate în acest flux: {duplicateQuestionKeys.join(", ")}. Schimbă fiecare cheie astfel încât să fie unică înainte de salvare.
                </p>
              )}
              <div className="space-y-3">
                {activeFlow.questions.map((question, index) => (
                  <div key={`${question.key}-${index}`} className="space-y-3 rounded-lg border border-border/80 bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-2">
                       <div className="flex items-center gap-3">
                         <p className="text-sm font-semibold">Întrebarea {index + 1}</p>
                         <label className="flex items-center gap-2 text-xs text-muted-foreground">
                           <input
                             type="checkbox"
                             checked={postedQuestionKeys.has(question.key)}
                             onChange={(event) => setPostedQuestion(activeFlowKind, question.key, event.target.checked)}
                           />
                           Postează în mesajul final
                         </label>
                       </div>
                       <div className="flex gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => moveQuestion(activeFlowKind, index, -1)} disabled={index === 0}>↑</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => moveQuestion(activeFlowKind, index, 1)} disabled={index === activeFlow.questions.length - 1}>↓</Button>
                        <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => removeQuestion(activeFlowKind, index)} disabled={activeFlow.questions.length <= 1}>Șterge</Button>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Cheie internă</label>
                        <Input value={question.key} maxLength={32} onChange={(event) => updateQuestion(activeFlowKind, index, "key", event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Etichetă</label>
                        <EmojiField value={question.label} maxLength={45} onChange={(value) => updateQuestion(activeFlowKind, index, "label", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">Întrebarea / descrierea afișată</label>
                        <EmojiField multiline rows={2} maxLength={900} value={question.description} onChange={(value) => updateQuestion(activeFlowKind, index, "description", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Placeholder</label>
                        <EmojiField value={question.placeholder} maxLength={100} onChange={(value) => updateQuestion(activeFlowKind, index, "placeholder", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                      </div>
                      <ImageField
                        label="Thumbnail după acest răspuns (opțional)"
                        value={question.thumbnailUrl}
                        guildId={guildId}
                        csrfToken={session?.csrfToken}
                        onChange={(value) => updateQuestion(activeFlowKind, index, "thumbnailUrl", value)}
                      />
                      <ImageField
                        label="Imaginea afișată după acest răspuns (opțional)"
                        value={question.imageUrl}
                        guildId={guildId}
                        csrfToken={session?.csrfToken}
                        onChange={(value) => updateQuestion(activeFlowKind, index, "imageUrl", value)}
                      />
                      <div className="flex items-center gap-5 pt-6 text-sm">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={question.multiline} onChange={(event) => updateQuestion(activeFlowKind, index, "multiline", event.target.checked)} />
                          Răspuns lung
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(activeFlowKind, index, "required", event.target.checked)} />
                          Obligatoriu
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <details open className="overflow-hidden rounded-xl border border-[#3f4147] bg-[#1e1f22]">
              <summary className="cursor-pointer list-none border-b border-[#3f4147] px-4 py-3 text-sm font-semibold text-[#f2f3f5]">
                <span className="mr-2 text-primary">▶</span>
                Previzualizare test · {FLOW_KINDS.find(([kind]) => kind === activeFlowKind)?.[1] ?? "Flux activ"}
              </summary>
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="rounded-lg bg-[#2b2d31] p-4">
                  <p className="mb-3 text-[10px] font-mono tracking-[0.18em] text-[#b5bac1]">MESAJUL DIN PANOU</p>
                  {activeFlow.panelThumbnailUrl && <img src={activeFlow.panelThumbnailUrl} alt="" className="float-right ml-3 h-16 w-16 rounded object-cover" />}
                  <h4 className="text-base font-semibold text-[#f2f3f5]"><DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.title}</DiscordEmojiText></h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]">
                    <DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.panelDescription}</DiscordEmojiText>
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-xs text-[#b5bac1]"><DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.requirementsText}</DiscordEmojiText></p>
                  <div className="mt-4 space-y-2 border-t border-[#3f4147] pt-3">
                    {activeFlow.questions.map((question, index) => (
                      <div key={`preview-question-${question.key}-${index}`} className="flex gap-2 text-xs">
                        <span className="font-semibold text-[#949ba4]">{index + 1}.</span>
                        <span className="text-[#dbdee1]"><DiscordEmojiText emojis={metadata?.emojis}>{question.label}</DiscordEmojiText></span>
                      </div>
                    ))}
                  </div>
                  <Button type="button" size="sm" className="mt-4 pointer-events-none">
                    <DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.startButtonLabel}</DiscordEmojiText>
                  </Button>
                  {activeFlow.panelImageUrl && <img src={activeFlow.panelImageUrl} alt="" className="mt-3 max-h-40 w-full rounded object-contain" />}
                </div>

                <div className="rounded-lg bg-[#2b2d31] p-4">
                  <p className="mb-3 text-[10px] font-mono tracking-[0.18em] text-[#b5bac1]">MESAJUL DUPĂ COMPLETARE</p>
                  {activeFlow.completionThumbnailUrl && <img src={activeFlow.completionThumbnailUrl} alt="" className="float-right ml-3 h-16 w-16 rounded object-cover" />}
                  <h4 className="text-base font-semibold text-[#f2f3f5]">Formular complet</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]">
                    <DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.completionMessage}</DiscordEmojiText>
                  </p>
                  <div className="mt-4 space-y-2 border-t border-[#3f4147] pt-3">
                    {activeFlow.questions.filter((question) => postedQuestionKeys.has(question.key)).length > 0 ? (
                      activeFlow.questions
                        .filter((question) => postedQuestionKeys.has(question.key))
                        .map((question, index) => (
                          <div key={`preview-answer-${question.key}-${index}`} className="rounded-md bg-[#1e1f22] px-3 py-2">
                            <p className="text-xs font-semibold text-[#f2f3f5]"><DiscordEmojiText emojis={metadata?.emojis}>{question.label}</DiscordEmojiText></p>
                            <p className="mt-1 text-xs italic text-[#949ba4]">
                              {question.placeholder || "Răspunsul membrului va apărea aici"}
                            </p>
                          </div>
                        ))
                    ) : (
                      <p className="text-xs italic text-[#949ba4]">Nu este selectat niciun răspuns pentru mesajul final.</p>
                    )}
                  </div>
                  {activeFlow.completionAction === "notify_staff" && (
                    <p className="mt-4 text-xs text-primary">Mesajul va anunța rolul staff configurat.</p>
                  )}
                  {activeFlow.completionImageUrl && <img src={activeFlow.completionImageUrl} alt="" className="mt-3 max-h-40 w-full rounded object-contain" />}
                </div>
              </div>
              <p className="border-t border-[#3f4147] px-4 py-3 text-xs text-[#b5bac1]">
                Aceasta este o simulare. Pentru alt flux, schimbă „Tipul de ticket” de la Pasul 1.
              </p>
            </details>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Ticket className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Rutarea tichetelor</h2>
                <p className="text-xs text-muted-foreground">Alege categoriile Discord în care botul recunoaște și gestionează tichetele.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {TICKET_CATEGORIES.map(([key, label]) => {
                const current = draft.tickets.categories[key];
                const selected = categories.some((channel) => channel.id === current) ? current : "__manual__";
                return (
                  <div key={key} className="space-y-2">
                    <label className="text-sm font-medium">{label}</label>
                    <Select value={selected} onValueChange={(value) => setTicket(["categories", key], value === "__manual__" ? current : value)}>
                       <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege categorie" /></SelectTrigger>
                      <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                        <SelectItem value="__manual__">ID introdus manual</SelectItem>
                        {categories.map((category) => <SelectItem key={category.id} value={category.id}>▰ {category.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={current} aria-label={`${label} ID`} placeholder="ID categorie Discord" onChange={(event) => setTicket(["categories", key], event.target.value.trim())} />
                  </div>
                );
              })}
            </div>
          </section>

          {activeFlowKind === "partnership" && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Staff și publicarea alianțelor</h2>
                <p className="text-xs text-muted-foreground">Rolul care poate confirma sau refuza parteneriatele și canalul public pentru alianțele aprobate.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Rol staff alianțe</label>
                <Select value={metadata?.roles.some((role) => role.id === draft.tickets.staffReviewRoleId) ? draft.tickets.staffReviewRoleId : "__manual__"} onValueChange={(value) => setTicket(["staffReviewRoleId"], value === "__manual__" ? draft.tickets.staffReviewRoleId : value)}>
                   <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege rol" /></SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                    <SelectItem value="__manual__">ID introdus manual</SelectItem>
                    {metadata?.roles.filter((role) => !role.managed).map((role) => <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={draft.tickets.staffReviewRoleId} placeholder="ID rol Discord" onChange={(event) => setTicket(["staffReviewRoleId"], event.target.value.trim())} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Canal public alianțe</label>
                <Select value={textChannels.some((channel) => channel.id === draft.tickets.alliancePublicChannelId) ? draft.tickets.alliancePublicChannelId : "__manual__"} onValueChange={(value) => setTicket(["alliancePublicChannelId"], value === "__manual__" ? draft.tickets.alliancePublicChannelId : value)}>
                   <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                    <SelectItem value="__manual__">ID introdus manual</SelectItem>
                    {textChannels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={draft.tickets.alliancePublicChannelId} placeholder="ID canal Discord" onChange={(event) => setTicket(["alliancePublicChannelId"], event.target.value.trim())} />
              </div>
            </div>
            <Input value={draft.tickets.allianceOwnerGuildId} placeholder="ID server owner pentru publicarea alianțelor" aria-label="ID server alianțe" onChange={(event) => setTicket(["allianceOwnerGuildId"], event.target.value.trim())} />
             <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
               <div>
                 <label className="text-sm font-medium">Mesajul public al parteneriatului</label>
                 <p className="mt-1 text-xs text-muted-foreground">
                   Acest șablon este folosit când stafful apasă „Publică pactul”. Poți decide exact ce apare și dacă este trimis ca text sau embed.
                 </p>
               </div>
               <EmojiField
                  multiline
                 rows={12}
                 maxLength={2000}
                 value={draft.tickets.allianceAnnouncementTemplate}
                  onChange={(value) => setTicket(["allianceAnnouncementTemplate"], value)}
                  guildId={guildId}
                  csrfToken={session?.csrfToken}
                  emojis={metadata?.emojis}
                  onEmojiCreated={refetchMetadata}
               />
               <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Formatul publicării</label>
                   <Select
                     value={draft.tickets.allianceAnnouncementMode}
                     onValueChange={(value) => setTicket(["allianceAnnouncementMode"], value)}
                   >
                     <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="text">Text simplu în mesaj</SelectItem>
                       <SelectItem value="embed">Embed Discord</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 <div className="space-y-2 text-xs text-muted-foreground">
                   <p className="font-medium text-foreground">Variabile disponibile</p>
                   <p className="font-mono leading-relaxed">
                     {"{server_name}"} · {"{description}"} · {"{invite}"} · {"{representative}"} · {"{members_total}"} · {"{members_online}"} · {"{members}"} · {"{motivation}"} · {"{offer}"} · {"{terms}"} · {"{applicant}"} · {"{applicant_mention}"}
                   </p>
                   <p>„Membri total” și „online” sunt citite din invitația Discord la publicare. Dacă Discord nu le poate oferi, se afișează „Nedisponibil”.</p>
                 </div>
               </div>
                <ImageField
                   label="Imagine mare sub anunțul public"
                  value={draft.tickets.allianceAnnouncementImageUrl}
                  guildId={guildId}
                  csrfToken={session?.csrfToken}
                  onChange={(value) => {
                    setTicket(["allianceAnnouncementImageUrl"], value);
                    setTicket(["allianceAnnouncementImageMode"], "large");
                  }}
                />
                 <ImageField
                   label="Thumbnail mic în dreapta anunțului public"
                   value={draft.tickets.allianceAnnouncementThumbnailUrl}
                   guildId={guildId}
                   csrfToken={session?.csrfToken}
                   onChange={(value) => {
                     setTicket(["allianceAnnouncementThumbnailUrl"], value);
                     setTicket(["allianceAnnouncementImageMode"], "large");
                   }}
                 />
                 <div className="mt-4 border-t border-border/70 pt-4">
                   <label className="text-sm font-medium">Mesajul de recrutare al alianței</label>
                   <p className="mt-1 text-xs text-muted-foreground">Text de recrutare păstrat în configurație. Pentru anunțul publicat pe Discord, folosește șablonul și imaginea de mai sus.</p>
                    <EmojiField
                      multiline
                     value={draft.allianceRecruitmentText}
                     maxLength={2000}
                     rows={5}
                     className="mt-2 resize-y"
                     placeholder="Scrie mesajul de recrutare..."
                      onChange={(value) => setDraft({ ...draft, allianceRecruitmentText: value })}
                      guildId={guildId}
                      csrfToken={session?.csrfToken}
                      emojis={metadata?.emojis}
                      onEmojiCreated={refetchMetadata}
                   />
                 </div>
               <p className="text-right text-xs text-muted-foreground">
                 {draft.tickets.allianceAnnouncementTemplate.length}/2000
               </p>
             </div>
          </section>
          )}

          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div>
              <h2 className="font-medium">Termene pentru tichete incomplete</h2>
              <p className="text-xs text-muted-foreground">Minute de la crearea canalului: avertisment 1, avertisment 2 și ștergere automată.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["firstWarningMinutes", "Primul avertisment", 1, 180],
                ["secondWarningMinutes", "Al doilea avertisment", 2, 239],
                ["incompleteTimeoutMinutes", "Ștergere automată", 10, 240],
              ].map(([key, label, min, max]) => (
                <div key={String(key)} className="space-y-2">
                  <label className="text-sm font-medium">{label}</label>
                  <Input type="number" min={Number(min)} max={Number(max)} value={draft.tickets[key as keyof typeof draft.tickets] as number} onChange={(event) => setTicket([String(key)], Number(event.target.value))} />
                  <p className="text-xs text-muted-foreground">{min}–{max} minute</p>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>
 
        <TabsContent value="messages" className="mt-0 space-y-5">
          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Users className="mt-1 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">Bun venit și rămas-bun generate de AI</h2>
                <p className="text-xs text-muted-foreground">
                  AI scrie un mesaj nou pentru fiecare intrare sau plecare. Botul adaugă automat mențiunea Discord a membrului.
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={resetMemberMessages}>
                <RotateCcw className="h-3.5 w-3.5" /> Implicit
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 p-3">
                <span className="space-y-1">
                  <span className="block text-sm font-medium">Mesaj de bun venit</span>
                  <span className="block text-xs text-muted-foreground">Generează un mesaj când intră cineva.</span>
                </span>
                <Switch
                  checked={draft.gameplayConfig.memberMessages.welcomeEnabled}
                  onCheckedChange={(checked) => setMemberMessage("welcomeEnabled", checked)}
                  aria-label="Activează mesajele de bun venit"
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 p-3">
                <span className="space-y-1">
                  <span className="block text-sm font-medium">Mesaj la plecare</span>
                  <span className="block text-xs text-muted-foreground">Generează un rămas-bun când pleacă cineva.</span>
                </span>
                <Switch
                  checked={draft.gameplayConfig.memberMessages.leaveEnabled}
                  onCheckedChange={(checked) => setMemberMessage("leaveEnabled", checked)}
                  aria-label="Activează mesajele la plecare"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium">Canalul pentru mesaje</span>
                <Select
                  value={selectedMemberMessageChannel}
                  onValueChange={(value) => {
                    if (value !== "__manual__") {
                      setMemberMessage("channelId", value === "__none__" ? "" : value);
                    }
                  }}
                >
                  <SelectTrigger className="mod-select-trigger">
                    <SelectValue placeholder="Alege canal" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                    <SelectItem value="__none__">Neconfigurat</SelectItem>
                    {selectedMemberMessageChannel === "__manual__" && (
                      <SelectItem value="__manual__">Canal introdus manual ({memberMessageChannelId})</SelectItem>
                    )}
                    {textChannels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  inputMode="numeric"
                  value={memberMessageChannelId}
                  onChange={(event) => setMemberMessage("channelId", event.target.value.trim())}
                  placeholder="ID canal Discord"
                  aria-label="ID canal bun venit și plecare"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium">Stilul AI</span>
                <Select
                  value={draft.gameplayConfig.memberMessages.style}
                  onValueChange={(value) => setMemberMessage("style", value as BotControlConfig["gameplayConfig"]["memberMessages"]["style"])}
                >
                  <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEMBER_MESSAGE_STYLES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            {(draft.gameplayConfig.memberMessages.welcomeEnabled || draft.gameplayConfig.memberMessages.leaveEnabled)
              && !memberMessageChannelId && (
                <p role="alert" className="text-xs text-amber-300">
                  Alege un canal înainte să salvezi mesajele de bun venit sau plecare.
                </p>
              )}

            {draft.gameplayConfig.memberMessages.style === "custom" && (
              <label className="block space-y-2 text-sm">
                <span className="text-xs font-medium">Descrie tema personalizată</span>
                <Textarea
                  rows={3}
                  maxLength={180}
                  value={draft.gameplayConfig.memberMessages.customStyle}
                  onChange={(event) => setMemberMessage("customStyle", event.target.value)}
                  placeholder="Ex.: ton de basm românesc, cald și poetic"
                />
                <span className="text-xs text-muted-foreground">AI va păstra limba română și va genera fiecare mesaj separat.</span>
              </label>
            )}
          </section>
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Megaphone className="mt-1 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">Mesaje de stare</h2>
                <p className="text-xs text-muted-foreground">Acestea sunt mesajele trimise când jocul sau Oracle AI sunt oprite.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={resetGameplayMessages}>
                <RotateCcw className="h-3.5 w-3.5" /> Implicit
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-xs font-medium">Joc oprit</span>
                <EmojiField multiline rows={4} maxLength={2000} value={draft.gameplayConfig.messages.gamePaused} onChange={(value) => setGameplayMessage("gamePaused", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                <ImageField label="Imagine pentru mesajul Joc oprit" value={draft.gameplayConfig.messages.gamePausedImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGameplayMessage("gamePausedImageUrl", value)} />
                <ImageField label="Thumbnail pentru mesajul Joc oprit" value={draft.gameplayConfig.messages.gamePausedThumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGameplayMessage("gamePausedThumbnailUrl", value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs font-medium">Oracle AI oprit</span>
                <EmojiField multiline rows={4} maxLength={2000} value={draft.gameplayConfig.messages.oraclePaused} onChange={(value) => setGameplayMessage("oraclePaused", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                <ImageField label="Imagine pentru mesajul Oracle oprit" value={draft.gameplayConfig.messages.oraclePausedImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGameplayMessage("oraclePausedImageUrl", value)} />
                <ImageField label="Thumbnail pentru mesajul Oracle oprit" value={draft.gameplayConfig.messages.oraclePausedThumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGameplayMessage("oraclePausedThumbnailUrl", value)} />
              </label>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="statistics" className="mt-0 space-y-5">
          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Link2 className="mt-1 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">Statistici pentru invitații Discord</h2>
                <p className="text-xs text-muted-foreground">
                  Urmărește intrările atribuite fiecărui cod, creatorul invitației și utilizările raportate de Discord.
                  ID-urile membrilor nu sunt păstrate în statisticile invitațiilor.
                </p>
              </div>
              <Switch
                checked={draft.inviteTracking.enabled}
                onCheckedChange={(checked) => setInviteTracking("enabled", checked)}
                aria-label="Activează colectarea statisticilor invitațiilor"
              />
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-xs text-muted-foreground">
              Pentru atribuire, botul are nevoie de permisiunea Discord <strong>Manage Server</strong> și de intenția
              privilegiată <strong>Server Members</strong> activată în Discord Developer Portal și în configurația botului.
              Diferențele dintre utilizările codurilor și evenimentele de intrare sunt atribuite; cazurile neconfirmate
              rămân marcate ca neatribuite.
              {metadata?.botCapabilities?.canManageGuild === false && (
                <p className="mt-2 font-medium text-destructive">Botului îi lipsește momentan permisiunea Manage Server.</p>
              )}
              {metadata?.botCapabilities?.guildMembers === false && (
                <p className="mt-2 font-medium text-destructive">Intenția Server Members nu este activă; intrările nu vor fi captate.</p>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 p-4">
              <div>
                <h3 className="text-sm font-medium">Jurnal pentru fiecare intrare</h3>
                <p className="text-xs text-muted-foreground">
                  Postează cine a intrat și cine l-a invitat. Dacă Discord nu poate confirma invitația, intrarea apare ca neatribuită.
                </p>
              </div>
              <label className="block max-w-md space-y-1 text-sm">
                <span className="text-xs font-medium">Canal jurnal invitații</span>
                <Select
                  disabled={!draft.inviteTracking.enabled}
                  value={draft.inviteTracking.joinLogChannelId || "__none__"}
                  onValueChange={(value) => setInviteTracking("joinLogChannelId", value === "__none__" ? "" : value)}
                >
                  <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                    <SelectItem value="__none__">Dezactivat</SelectItem>
                    {textChannels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Raport automat în Discord</h3>
                  <p className="text-xs text-muted-foreground">Publică în canal un clasament zilnic sau săptămânal.</p>
                </div>
                <Switch
                  checked={draft.inviteTracking.reportEnabled}
                  disabled={!draft.inviteTracking.enabled}
                  onCheckedChange={(checked) => setInviteTracking("reportEnabled", checked)}
                  aria-label="Activează raportul automat al invitațiilor"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Canal raport</span>
                  <Select
                    value={draft.inviteTracking.reportChannelId || "__none__"}
                    onValueChange={(value) => setInviteTracking("reportChannelId", value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                      <SelectItem value="__none__">Alege canal</SelectItem>
                      {textChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Frecvență</span>
                  <Select
                    value={draft.inviteTracking.reportFrequency}
                    onValueChange={(value) => setInviteTracking("reportFrequency", value as BotControlConfig["inviteTracking"]["reportFrequency"])}
                  >
                    <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Zilnic</SelectItem>
                      <SelectItem value="weekly">Săptămânal</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Ora raportului</span>
                  <Input
                    type="time"
                    value={draft.inviteTracking.reportTime}
                    onChange={(event) => setInviteTracking("reportTime", event.target.value)}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Fus orar</span>
                  <Select
                    value={draft.inviteTracking.reportTimeZone}
                    onValueChange={(value) => setInviteTracking("reportTimeZone", value as BotControlConfig["inviteTracking"]["reportTimeZone"])}
                  >
                    <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Europe/Bucharest">Europe/Bucharest</SelectItem>
                      <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {draft.inviteTracking.reportFrequency === "weekly" && (
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium">Ziua raportului săptămânal</span>
                    <Select
                      value={String(draft.inviteTracking.reportWeekday)}
                      onValueChange={(value) => setInviteTracking("reportWeekday", Number(value))}
                    >
                      <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Luni</SelectItem>
                        <SelectItem value="2">Marți</SelectItem>
                        <SelectItem value="3">Miercuri</SelectItem>
                        <SelectItem value="4">Joi</SelectItem>
                        <SelectItem value="5">Vineri</SelectItem>
                        <SelectItem value="6">Sâmbătă</SelectItem>
                        <SelectItem value="7">Duminică</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                )}
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Linkuri afișate în raport (3–10)</span>
                  <Input
                    type="number"
                    min={3}
                    max={10}
                    step={1}
                    value={draft.inviteTracking.reportTopLimit}
                    onChange={(event) => setInviteTracking("reportTopLimit", Number(event.target.value))}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Performanța linkurilor</h3>
                  <p className="text-xs text-muted-foreground">
                    Intrările atribuite sunt colectate numai după activarea urmăririi.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={inviteRange} onValueChange={(value) => setInviteRange(value as InviteStatsRange)}>
                    <SelectTrigger className="mod-select-trigger w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Ultimele 7 zile</SelectItem>
                      <SelectItem value="30">Ultimele 30 zile</SelectItem>
                      <SelectItem value="90">Ultimele 90 zile</SelectItem>
                      <SelectItem value="all">Tot istoricul</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" disabled={inviteStatsSyncing} onClick={() => {
                    void syncInviteStats().then(() => {
                      toast({ title: "Invitațiile au fost sincronizate", description: "Lista și numărul curent de utilizări au fost reîmprospătate." });
                    }).catch((syncError: any) => {
                      toast({ variant: "destructive", title: "Sincronizarea a eșuat", description: syncError?.message ?? "Verifică permisiunea Manage Server a botului." });
                    });
                  }}>
                    {inviteStatsSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Sincronizează
                  </Button>
                </div>
              </div>

              {inviteStatsError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  {inviteStatsError.message}
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Intrări atribuite</p>
                  <p className="mt-1 text-2xl font-semibold">{(inviteStats?.totals.attributedJoins ?? 0).toLocaleString("ro-RO")}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Intrări neatribuite</p>
                  <p className="mt-1 text-2xl font-semibold">{(inviteStats?.totals.unknownJoins ?? 0).toLocaleString("ro-RO")}</p>
                </div>
              </div>

              {inviteStatsLoading ? (
                <div className="flex justify-center p-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : inviteStats?.rows.length ? (
                <div className="overflow-x-auto rounded-lg border border-border/70">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Link de invitație</th>
                        <th className="px-3 py-2 font-medium">Creator</th>
                        <th className="px-3 py-2 font-medium">Intrări atribuite</th>
                        <th className="px-3 py-2 font-medium">Utilizări Discord</th>
                        <th className="px-3 py-2 font-medium">Stare</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {inviteStats.rows.map((row) => (
                        <tr key={row.code}>
                          <td className="px-3 py-2">
                            <a href={row.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{row.code}</a>
                          </td>
                          <td className="px-3 py-2">{row.inviterName ?? "Necunoscut"}</td>
                          <td className="px-3 py-2">{row.attributedJoins.toLocaleString("ro-RO")}</td>
                          <td className="px-3 py-2">{row.totalDiscordUses.toLocaleString("ro-RO")}</td>
                          <td className="px-3 py-2">{row.active ? "Activ" : "Inactiv"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  Nu există invitații sincronizate. Apasă „Sincronizează” pentru a încărca linkurile active din Discord.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Megaphone className="mt-1 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">Design statistici zilnice</h2>
                  <p className="text-xs text-muted-foreground">Personalizează raportul publicat automat în Discord. Poți folosi {`{guild}`}, {`{date}`}, {`{messages}`}, {`{uniqueUsers}`}, {`{boosts}`}, {`{joins}`}, {`{leaves}`} și {`{peakVoice}`} în titlu sau descriere.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={resetDailyStats}>
                <RotateCcw className="h-3.5 w-3.5" /> Implicit
              </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem]">
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium">Titlu raport</span>
                    <EmojiField maxLength={256} value={draft.dailyStats.title} onChange={(value) => setDailyStats("title", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium">Culoare accent</span>
                    <div className="flex gap-2">
                      <Input type="color" className="w-12 cursor-pointer p-1" value={draft.dailyStats.color} onChange={(event) => setDailyStats("color", event.target.value)} />
                      <Input maxLength={7} value={draft.dailyStats.color} onChange={(event) => setDailyStats("color", event.target.value)} />
                    </div>
                  </label>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-medium">Descriere raport</span>
                  <EmojiField multiline rows={4} maxLength={4000} value={draft.dailyStats.description} onChange={(value) => setDailyStats("description", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-medium">Canal raport zilnic</span>
                  <Select
                    value={draft.dailyStats.channelId || "__main_channel__"}
                    onValueChange={(value) => setDailyStats("channelId", value === "__main_channel__" ? "" : value)}
                  >
                    <SelectTrigger aria-label="Canal raport zilnic">
                      <SelectValue placeholder="Canalul principal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__main_channel__">Folosește canalul principal</SelectItem>
                      {textChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="block text-xs text-muted-foreground">Alege un canal separat sau păstrează canalul principal configurat la „Canale”.</span>
                </label>
                <ImageField label="Imaginea raportului zilnic" value={draft.dailyStats.imageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setDailyStats("imageUrl", value)} />
                <ImageField label="Thumbnail-ul raportului zilnic" value={draft.dailyStats.thumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setDailyStats("thumbnailUrl", value)} />
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium">Titlu activitate</span>
                    <EmojiField maxLength={256} value={draft.dailyStats.activityTitle} onChange={(value) => setDailyStats("activityTitle", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium">Titlu top canale</span>
                    <EmojiField maxLength={256} value={draft.dailyStats.channelsTitle} onChange={(value) => setDailyStats("channelsTitle", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                  </label>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-medium">Subsol</span>
                  <EmojiField maxLength={2048} value={draft.dailyStats.footer} onChange={(value) => setDailyStats("footer", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                </label>
                <div>
                  <p className="mb-2 text-xs font-medium">Etichete indicatori</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(Object.entries(draft.dailyStats.metricLabels) as Array<[keyof BotControlConfig["dailyStats"]["metricLabels"], string]>).map(([key, value]) => (
                      <EmojiField key={key} maxLength={256} value={value} aria-label={key} onChange={(next) => setDailyStatsMetric(key, next)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                    ))}
                  </div>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-medium">Text când nu există canale active</span>
                  <EmojiField maxLength={1024} value={draft.dailyStats.emptyChannelsText} onChange={(value) => setDailyStats("emptyChannelsText", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                </label>
              </div>
              <div className="h-fit rounded-xl border bg-[#1e1f22] p-3 text-[#f2f3f5] shadow-xl" style={{ borderLeftColor: draft.dailyStats.color, borderLeftWidth: 4 }}>
                <p className="mb-3 text-[10px] font-semibold tracking-[0.18em] text-[#949cf7]">PREVIZUALIZARE EMBED</p>
                <div className="rounded-md bg-[#2b2d31] p-3">
                  {draft.dailyStats.thumbnailUrl && <img src={draft.dailyStats.thumbnailUrl} alt="" className="float-right ml-3 h-20 w-20 rounded object-cover" />}
                  <p className="text-[10px] font-semibold tracking-wider text-[#949cf7]">ORACOLUL CENUȘII · COMMUNITY INSIGHTS</p>
                  <h3 className="mt-2 font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{renderDailyStatsPreviewText(draft.dailyStats.title)}</DiscordEmojiText></h3>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-[#b5bac1]"><DiscordEmojiText emojis={metadata?.emojis}>{renderDailyStatsPreviewText(draft.dailyStats.description)}</DiscordEmojiText></p>
                  <div className="mt-4">
                    <p className="mb-1 text-xs font-semibold">📊 Rezumat</p>
                    <div className="space-y-1 rounded bg-[#36393f] p-2 text-xs leading-relaxed">
                      {DAILY_STATS_PREVIEW_METRIC_ROWS.map((row) => (
                        <p key={row[0][0]} className="break-words">
                          {row.map(([key, value], index) => (
                            <span key={key}>
                              {index > 0 && <span className="mx-1 text-[#b5bac1]">·</span>}
                              <DiscordEmojiText emojis={metadata?.emojis}>{draft.dailyStats.metricLabels[key]}</DiscordEmojiText>{": "}
                              <strong>{value.toLocaleString("ro-RO")}</strong>
                            </span>
                          ))}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{draft.dailyStats.activityTitle}</DiscordEmojiText></p>
                    <p className="break-words rounded bg-[#1e1f22] p-2 text-xs leading-relaxed">
                      {DAILY_STATS_PREVIEW_ACTIVITY.map((item) => `${item.day.slice(8, 10)}/${item.day.slice(5, 7)}: ${item.messages.toLocaleString("ro-RO")}`).join(" · ")}
                    </p>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{draft.dailyStats.channelsTitle}</DiscordEmojiText></p>
                    <div className="space-y-1 text-xs">
                      {DAILY_STATS_PREVIEW_CHANNELS.map((channel, index) => (
                        <p key={channel.name}>
                          {index + 1}. <strong>#{channel.name}</strong> · {channel.messages.toLocaleString("ro-RO")} mesaje
                        </p>
                      ))}
                    </div>
                  </div>
                  {draft.dailyStats.imageUrl && <img src={draft.dailyStats.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded object-contain" />}
                  <p className="mt-4 border-t border-white/10 pt-3 text-[10px] text-[#949ba4]">
                    <DiscordEmojiText emojis={metadata?.emojis}>{draft.dailyStats.footer}</DiscordEmojiText>
                    <span className="ml-2 text-[#777d86]">18 septembrie 2026</span>
                  </p>
                </div>
              </div>
            </div>
          </section>

        </TabsContent>
      </Tabs>
      </div>

      {hasUnsavedChanges && (
        <div className="mod-save-bar sticky bottom-3 z-20 flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-muted-foreground font-medium text-sm">
            <span className={`bot-control-save-dot ${saving ? "is-saving" : ""}`} />
            <span>{saving ? "Se salvează setările…" : "Ai modificări nesalvate."}</span>
          </div>
          <div className="mod-save-actions ml-auto flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={openFlowTest} className="gap-2 font-medium tracking-wide">
              <PlayCircle className="h-4 w-4" />
              Testează fluxul
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="gap-2 px-8 font-semibold tracking-wide shadow-lg shadow-primary/20">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Se salvează…" : "Salvează controlul botului"}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={provisionConfirmOpen} onOpenChange={setProvisionConfirmOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmă sincronizarea cu Discord</DialogTitle>
            <DialogDescription>
              Verifică categoriile și accesul înainte de a modifica serverul. Vor fi create canalele lipsă, iar permisiunile de acces gestionate aici vor fi actualizate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {PROVISIONING_CATEGORIES
              .filter((category) => selectedProvisioningCategories.includes(category.key))
              .map((category) => {
                const permission = provisioningPermissions[category.key] ?? DEFAULT_CHANNEL_PERMISSION;
                const allowedRoles = permission.roleIds
                  .map((roleId) => metadata?.roles.find((role) => role.id === roleId))
                  .filter((role): role is NonNullable<typeof role> => Boolean(role));
                return (
                  <article key={category.key} className="rounded-lg border border-border bg-muted/20 p-3">
                    <h3 className="text-sm font-medium">{category.label}</h3>
                    {allowedRoles.length ? (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {allowedRoles.map((role) => {
                          const access = permission.rolePermissions?.[role.id] ?? {
                            viewChannel: true,
                            readMessageHistory: permission.readMessageHistory,
                            sendMessages: permission.sendMessages,
                          };
                          const roleLabel = role.id === metadata?.guild.id ? "@everyone" : `@${role.name}`;
                          return (
                            <li key={role.id}>
                              {roleLabel}: vede {access.viewChannel ? "Da" : "Nu"} · istoric {access.readMessageHistory ? "Da" : "Nu"} · scrie {access.sendMessages ? "Da" : "Nu"}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Niciun rol suplimentar selectat. Regulile Discord existente pentru celelalte roluri rămân neschimbate.
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {category.items.join(" · ")}
                    </p>
                  </article>
                );
              })}
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-muted-foreground">
              Suprascrierile pentru roluri care nu sunt gestionate de aceste setări rămân neschimbate. La eliminarea unui rol din configurație se șterg doar regulile de vizualizare, istoric și scriere create de acest panou.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProvisionConfirmOpen(false)}>
              Înapoi
            </Button>
            <Button type="button" onClick={() => void provision()} disabled={provisioning}>
              {provisioning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
              Aplică și sincronizează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-[#3f4147] bg-[#1e1f22] text-[#f2f3f5]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              Test local · {FLOW_KINDS.find(([kind]) => kind === activeFlowKind)?.[1] ?? "Flux ticket"}
            </DialogTitle>
            <DialogDescription className="text-[#b5bac1]">
              Simulează pașii pe care îi vede membrul. Nu se creează ticket și nu se postează nimic pe Discord.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-[#3f4147] bg-[#2b2d31] p-4">
              <p className="text-[10px] font-mono tracking-[0.18em] text-[#b5bac1]">PANOU DISCORD SIMULAT</p>
              {activeFlow.panelThumbnailUrl && <img src={activeFlow.panelThumbnailUrl} alt="" className="float-right ml-3 h-16 w-16 rounded object-cover" />}
              <h3 className="mt-2 text-lg font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.title}</DiscordEmojiText></h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]"><DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.panelDescription}</DiscordEmojiText></p>
              <p className="mt-3 whitespace-pre-wrap text-xs text-[#b5bac1]"><DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.requirementsText}</DiscordEmojiText></p>
              {!testStarted && !testCompleted && (
                <Button type="button" className="mt-4 gap-2" onClick={() => setTestStarted(true)}>
                  <PlayCircle className="h-4 w-4" />
                  <DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.startButtonLabel}</DiscordEmojiText>
                </Button>
              )}
              {activeFlow.panelImageUrl && <img src={activeFlow.panelImageUrl} alt="" className="mt-3 max-h-48 w-full rounded object-contain" />}
            </div>

            {testStarted && !testCompleted && testQuestion && (
              <div className="rounded-lg border border-primary/40 bg-[#2b2d31] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-mono tracking-[0.14em] text-primary">
                    ÎNTREBAREA {testStep + 1}/{activeFlow.questions.length}
                  </p>
                  <span className="text-xs text-[#b5bac1]">
                    {testQuestion.required ? "Obligatoriu" : "Opțional"}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{testQuestion.label}</DiscordEmojiText></h3>
                {testQuestion.thumbnailUrl && <img src={testQuestion.thumbnailUrl} alt="" className="float-right ml-3 h-16 w-16 rounded object-cover" />}
                <p className="mt-1 text-sm text-[#dbdee1]"><DiscordEmojiText emojis={metadata?.emojis}>{testQuestion.description}</DiscordEmojiText></p>
                {testQuestion.imageUrl && <img src={testQuestion.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded object-contain" />}
                {testQuestion.multiline ? (
                  <Textarea
                    autoFocus
                    rows={4}
                    value={testDraftAnswer}
                    placeholder={testQuestion.placeholder}
                    onChange={(event) => {
                      setTestDraftAnswer(event.target.value);
                      setTestError("");
                    }}
                    className="mt-4 border-[#4b4f58] bg-[#1e1f22] text-[#f2f3f5]"
                  />
                ) : (
                  <Input
                    autoFocus
                    value={testDraftAnswer}
                    placeholder={testQuestion.placeholder}
                    onChange={(event) => {
                      setTestDraftAnswer(event.target.value);
                      setTestError("");
                    }}
                    className="mt-4 border-[#4b4f58] bg-[#1e1f22] text-[#f2f3f5]"
                  />
                )}
                {testError && <p className="mt-2 text-xs text-destructive">{testError}</p>}
                <div className="mt-4 flex justify-end">
                  <Button type="button" onClick={submitTestAnswer}>
                    {testStep === activeFlow.questions.length - 1 ? "Finalizează simularea" : "Salvează și continuă"}
                  </Button>
                </div>
              </div>
            )}

            {Object.keys(testAnswers).length > 0 && (
              <div className="space-y-2 rounded-lg border border-[#3f4147] bg-[#2b2d31] p-4">
                <p className="text-[10px] font-mono tracking-[0.18em] text-[#b5bac1]">RĂSPUNSURI SIMULATE</p>
                {activeFlow.questions
                  .filter((question) => testAnswers[question.key] !== undefined)
                  .map((question) => (
                    <div key={`test-answer-${question.key}`} className="rounded-md bg-[#1e1f22] px-3 py-2">
                      <p className="text-xs font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{question.label}</DiscordEmojiText></p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">{testAnswers[question.key]}</p>
                    </div>
                  ))}
              </div>
            )}

            {testCompleted && (
              <div className="rounded-lg border border-emerald-500/40 bg-[#2b2d31] p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <p className="text-[10px] font-mono tracking-[0.18em] text-emerald-300">
                    {activeFlowKind === "partnership" ? "REZUMAT STAFF ÎN TICKET" : "MESAJ FINAL SIMULAT"}
                  </p>
                </div>
                <h3 className="mt-3 text-base font-semibold">
                  {activeFlowKind === "partnership"
                    ? "🤝 Contract de Parteneriat · Rezumat pentru staff"
                    : "Formular complet"}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]"><DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.completionMessage}</DiscordEmojiText></p>
                {activeFlow.completionThumbnailUrl && <img src={activeFlow.completionThumbnailUrl} alt="" className="float-right ml-3 h-16 w-16 rounded object-cover" />}
                <div className="mt-4 space-y-2 border-t border-[#3f4147] pt-3">
                  {activeFlow.questions.filter((question) => postedQuestionKeys.has(question.key)).map((question) => (
                    <div key={`test-final-${question.key}`} className="rounded-md bg-[#1e1f22] px-3 py-2">
                      <p className="text-xs font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{question.label}</DiscordEmojiText></p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">{testAnswers[question.key] ?? "—"}</p>
                    </div>
                  ))}
                </div>
                {activeFlowKind === "partnership" && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[#3f4147] pt-3">
                    <Button type="button" size="sm" className="pointer-events-none">🛡️ Confirmă pentru publicare</Button>
                    <Button type="button" size="sm" variant="destructive" className="pointer-events-none">Refuză pactul</Button>
                  </div>
                )}
                {activeFlow.completionAction === "notify_staff" && (
                  <p className="mt-4 text-xs text-primary"><DiscordEmojiText emojis={metadata?.emojis}>{activeFlow.staffNotificationMessage}</DiscordEmojiText></p>
                )}
                {activeFlow.completionImageUrl && <img src={activeFlow.completionImageUrl} alt="" className="mt-3 max-h-48 w-full rounded object-contain" />}
              </div>
            )}

            {testCompleted && partnershipAnswers && (
              <>
                <div className="rounded-lg border border-[#7c8fbd]/50 bg-[#2b2d31] p-4">
                  <p className="text-[10px] font-mono tracking-[0.18em] text-[#b9c8ef]">DRAFT DUPĂ CONFIRMAREA STAFFULUI</p>
                  <h3 className="mt-2 text-base font-semibold">🤝 Contract de Parteneriat · Draft de publicare</h3>
                  <p className="mt-2 text-sm text-[#dbdee1]">
                    Draftul este vizibil în ticket până când stafful apasă „Publică pactul”.
                  </p>
                  <div className="mt-4 grid gap-2 border-t border-[#3f4147] pt-3 sm:grid-cols-2">
                    {[
                      ["🏰 Numele serverului", partnershipAnswers.server_name],
                      ["👤 Reprezentantul serverului", partnershipAnswers.representative],
                      ["🔗 Linkul serverului", partnershipAnswers.invite],
                      ["👥 Membri și activitate", partnershipAnswers.members],
                      ["📝 Descrierea serverului", partnershipAnswers.description],
                      ["🕯️ Motivul alianței", partnershipAnswers.motivation],
                      ["🎁 Ce oferă serverul", partnershipAnswers.offer],
                      ["📜 Așteptări și reguli", partnershipAnswers.terms],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md bg-[#1e1f22] px-3 py-2">
                        <p className="text-xs font-semibold">{label}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">{previewValue(value)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="pointer-events-none">📣 Publică pactul</Button>
                    <Button type="button" size="sm" variant="secondary" className="pointer-events-none">✏️ Revizuiește draftul</Button>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-500/40 bg-[#2b2d31] p-4">
                  <p className="text-[10px] font-mono tracking-[0.18em] text-amber-300">TEXTUL POSTAT ÎN CANALUL ALIANȚELOR</p>
                  <p className="mt-2 text-xs text-[#b5bac1]">
                     Acesta este mesajul public trimis după „Publică pactul”. Imaginea este simulată aici ca preview Discord.
                  </p>
                   <div className="mt-3 overflow-hidden rounded-md bg-[#1e1f22] p-3">
                     {draft.tickets.allianceAnnouncementMode === "embed" ? (
                       <div className="border-l-4 border-[#7c8fbd] pl-3">
                         <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#f2f3f5]"><DiscordEmojiText emojis={metadata?.emojis}>{partnershipAnnouncement}</DiscordEmojiText></p>
                          {draft.tickets.allianceAnnouncementThumbnailUrl && (
                            <img src={draft.tickets.allianceAnnouncementThumbnailUrl} alt="" className="float-right ml-3 h-20 w-20 rounded object-cover" />
                          )}
                          {draft.tickets.allianceAnnouncementImageUrl && (
                            <img src={draft.tickets.allianceAnnouncementImageUrl} alt="" className="mt-3 max-h-56 w-full rounded object-cover" />
                          )}
                       </div>
                     ) : (
                       <>
                         <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#f2f3f5]"><DiscordEmojiText emojis={metadata?.emojis}>{partnershipAnnouncement}</DiscordEmojiText></p>
                          {(draft.tickets.allianceAnnouncementImageUrl || draft.tickets.allianceAnnouncementThumbnailUrl) && (
                           <div className="mt-3 border-l-4 border-[#7c8fbd] pl-3">
                              {draft.tickets.allianceAnnouncementThumbnailUrl && (
                                <img src={draft.tickets.allianceAnnouncementThumbnailUrl} alt="" className="float-right ml-3 h-20 w-20 rounded object-cover" />
                              )}
                              {draft.tickets.allianceAnnouncementImageUrl && (
                                <img src={draft.tickets.allianceAnnouncementImageUrl} alt="" className="max-h-56 w-full rounded object-cover" />
                              )}
                           </div>
                         )}
                       </>
                     )}
                   </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <p className="text-xs text-[#b5bac1]">Modificările curente sunt testate local, chiar dacă nu sunt încă salvate.</p>
            <Button type="button" variant="secondary" onClick={resetFlowTest} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Repornește testul
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
