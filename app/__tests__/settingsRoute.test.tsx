// Settings route and header progress (Task 3.12; B-35, B-64): the header
// reads the day streak and XP today; choosing a daily goal updates the ring,
// stays on the device for a guest, and for a signed-in user is sent with
// PATCH /v1/me, a refused change leaving the goal as it was. Real
// AuthProvider, StatsProvider, and query client; apiFetch is routed to a
// fake server.
import { randomUUID } from "node:crypto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppShell } from "../../components/layout/AppShell";
import { createQueryClient } from "../../config/queryClient";
import { AUTH_STORAGE_KEY, STORAGE_KEY } from "../../constants/appConfig";
import { readLocalToday } from "../../services/progress/readLocalToday";
import { AuthProvider, useAuth } from "../../state/AuthProvider";
import { StatsProvider } from "../../state/StatsProvider";
import SettingsScreen from "../settings";

type ApiReply = { status: number; body?: unknown };
type ApiCall = { body?: unknown; method: string; path: string };

const mockServer: { calls: ApiCall[]; routes: Map<string, ApiReply> } = {
  calls: [],
  routes: new Map(),
};

jest.mock("../../clients/apiClient", () => ({
  apiFetch: (path: string, init: { method?: string; body?: unknown } = {}) => {
    const method = init.method ?? "GET";
    mockServer.calls.push({ body: init.body, method, path });
    const reply = mockServer.routes.get(`${method} ${path}`);
    return Promise.resolve(
      reply
        ? { body: reply.body ?? null, status: reply.status }
        : { body: null, status: 599 },
    );
  },
}));
jest.mock("../../state/SyncProvider", () => ({
  useSync: () => ({
    cancelPass: () => undefined,
    isSyncing: false,
    isUploadCapReached: false,
    syncNow: () => Promise.resolve(true),
  }),
}));
jest.mock("../../components/layout/ReviewDueLink", () => ({
  ReviewDueLink: () => null,
}));
jest.mock("../../components/layout/DownloadIndicator", () => ({
  DownloadIndicator: () => null,
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function OwnedStats({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <StatsProvider ownerUserId={user?.id ?? null}>{children}</StatsProvider>
  );
}

async function renderSettings() {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 800, width: 400, x: 0, y: 0 },
        insets: { bottom: 0, left: 0, right: 0, top: 0 },
      }}
    >
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider>
          <OwnedStats>
            <AppShell>
              <SettingsScreen />
            </AppShell>
          </OwnedStats>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function readRing() {
  return screen.getByRole("progressbar", { name: "Daily goal" });
}

function profileBody(dailyGoal: number) {
  return {
    data: {
      dailyGoal,
      dayStreak: 3,
      email: "ignored",
      entitlements: [],
      timezone: "UTC",
      xpToday: 12,
    },
  };
}

async function signInAs(userId: string) {
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [userId], userId }),
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockServer.calls = [];
  mockServer.routes = new Map();
});

describe("SettingsScreen", () => {
  it("has one h1, a labeled daily goal group, and the default goal of 20 selected", async () => {
    await renderSettings();
    const levelOne = screen
      .getAllByRole("heading")
      .filter((heading) => heading.props["aria-level"] === 1);
    expect(levelOne.map((heading) => String(heading.props.children))).toEqual([
      "Settings",
    ]);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "20 XP a day" })).toBeChecked(),
    );
    expect(
      screen.getByRole("radio", { name: "10 XP a day" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: "50 XP a day" }),
    ).not.toBeChecked();
  });

  it("for a guest, choosing 50 updates the ring and stores the goal from today without calling the API", async () => {
    await renderSettings();
    await waitFor(() => expect(readRing().props["aria-valuemax"]).toBe(20));
    fireEvent.press(screen.getByRole("radio", { name: "50 XP a day" }));
    await waitFor(() => expect(readRing().props["aria-valuemax"]).toBe(50));
    expect(screen.getByRole("radio", { name: "50 XP a day" })).toBeChecked();
    expect(mockServer.calls).toEqual([]);
    await waitFor(async () => {
      const stored = JSON.parse(
        (await AsyncStorage.getItem(STORAGE_KEY)) ?? "null",
      ) as { goalHistory: { from: string; goal: number }[] };
      expect(stored.goalHistory).toContainEqual({
        from: readLocalToday(),
        goal: 50,
      });
    });
  });

  it("when signed in, shows the /me streak and XP in the header and sends PATCH /me on a new goal", async () => {
    await signInAs(randomUUID());
    mockServer.routes.set("GET me", { body: profileBody(20), status: 200 });
    mockServer.routes.set("PATCH me", { body: profileBody(50), status: 200 });
    await renderSettings();
    await waitFor(() =>
      expect(screen.getByText("Day streak 3, 12 of 20 XP today")).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole("radio", { name: "50 XP a day" }));
    await waitFor(() => expect(readRing().props["aria-valuemax"]).toBe(50));
    expect(mockServer.calls).toContainEqual({
      body: { dailyGoal: 50 },
      method: "PATCH",
      path: "me",
    });
    expect(screen.getByText("Day streak 3, 12 of 50 XP today")).toBeTruthy();
  });

  it("when signed in and the server answers 503 SERVER_BUSY, announces it and keeps the goal", async () => {
    await signInAs(randomUUID());
    mockServer.routes.set("GET me", { body: profileBody(20), status: 200 });
    mockServer.routes.set("PATCH me", {
      body: { error: { code: "SERVER_BUSY" } },
      status: 503,
    });
    await renderSettings();
    await waitFor(() => expect(readRing().props["aria-valuemax"]).toBe(20));
    fireEvent.press(screen.getByRole("radio", { name: "50 XP a day" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").props.children).toMatch(/not saved/),
    );
    expect(readRing().props["aria-valuemax"]).toBe(20);
    expect(screen.getByRole("radio", { name: "20 XP a day" })).toBeChecked();
  });

  it('shows a signed-in user "Sign out" and "Delete account" controls in the account section', async () => {
    await signInAs(randomUUID());
    mockServer.routes.set("GET me", { body: profileBody(20), status: 200 });
    await renderSettings();
    expect(
      await screen.findByRole("button", { name: "Delete account" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it('shows a guest "Sign in" and no "Delete account" control', async () => {
    await renderSettings();
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
  });
});
