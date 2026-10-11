/*
 * Entry point of the FatNotes bespoke plugin.
 *
 * - `activate(sdk)` is called by FatNotes after the remote is loaded.
 *   Register contributions and store every `Disposable` you get back.
 * - `deactivate()` is called when the plugin is toggled off or uninstalled.
 *   Dispose everything you registered.
 *
 * NOTE: writes to the *secondary* sidebar are reserved for the Chat block
 * and will be rejected at the host SDK layer.
 */
import React from "react";
import type { Disposable, FatNotesPluginSDK } from "fat-notes-sdk";
import PluginView from "./PluginView";

const disposables: Disposable[] = [];

export async function activate(sdk: FatNotesPluginSDK): Promise<void> {
  // 1. Activity bar icon that activates a primary sidebar view.
  disposables.push(
    sdk.contributions.registerActivityBarItem({
      id: "fat-tools.main",
      title: "fat-tools",
      icon: "Puzzle",
    }),
  );

  // 2. Primary sidebar contribution bound to the activity bar item above.
  disposables.push(
    sdk.contributions.registerPrimarySidebar(() =>
      React.createElement(PluginView, { sdk }),
    ),
  );

  // 3. Panel tab (bottom panel).
  disposables.push(
    sdk.contributions.registerPanelTab({
      id: "fat-tools.panel",
      title: "fat-tools",
      render: () => React.createElement(PluginView, { sdk }),
    }),
  );

  // 4. Footer status item.
  disposables.push(
    sdk.contributions.registerFooterItem({
      id: "fat-tools.footer",
      align: "right",
      render: () =>
        React.createElement(
          "span",
          { style: { opacity: 0.75 } },
          `[fat-tools] ready`,
        ),
    }),
  );

  // 5. Example command — invoke via sdk.commands.execute(...).
  disposables.push(
    sdk.commands.register("fat-tools.ping", async () => {
      sdk.ui.toast.info(`[fat-tools] pong (host ${sdk.host.version})`);
      return "pong";
    }),
  );

  // 6. Settings Page.
  disposables.push(
    sdk.contributions.registerSettingsPage({
      id: "fat-tools.settings",
      title: "fat-tools Settings",
      render: () => React.createElement("div", { style: { padding: 20 } }, 
        React.createElement("h3", null, "fat-tools Settings"),
        React.createElement("p", null, "Custom configuration page for the plugin.")
      ),
    })
  );

  // 7. Workbench Page (Main area).
  disposables.push(
    sdk.contributions.registerWorkbenchPage({
      id: "fat-tools.main",
      render: () => React.createElement(PluginView, { sdk }),
    })
  );

  // 8. Block Types (Multiple)
  disposables.push(
    sdk.contributions.registerBlockType({
      type: "fat-tools.block1",
      title: "Block 1",
      iconUrl: "/icon.png",
      category: "other",
      render: (props) => React.createElement("div", null, "Block 1 content"),
    })
  );

  disposables.push(
    sdk.contributions.registerBlockType({
      type: "fat-tools.block2",
      title: "Block 2",
      iconUrl: "/icon.png",
      category: "other",
      render: (props) => React.createElement("div", null, "Block 2 content"),
    })
  );
}

export function deactivate(): void {
  while (disposables.length) {
    try {
      disposables.pop()?.dispose();
    } catch (e) {
      // Swallow — deactivate() must never throw.
      // eslint-disable-next-line no-console
      console.warn("[fat-tools] dispose error", e);
    }
  }
}
