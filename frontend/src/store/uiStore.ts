/**
 * uiStore — Ephemeral UI state (selection, sidebar, etc.)
 *
 * Keep this separate from data stores.
 * Never persist to localStorage — UI state resets on refresh.
 */
import { create } from 'zustand';
import type { TelemetryEvent, Alert } from '../types/telemetry';

interface UIState {
  selectedEvent:      TelemetryEvent | null;
  selectedAlert:      Alert | null;
  selectedIncidentId: string | null;
  /** Systems highlighted by the currently selected incident (cross-panel linking) */
  highlightedSystems: string[];
  highlightedSystem:  string | null;   // legacy single-system hover
  sidebarCollapsed:   boolean;

  setSelectedEvent:       (e: TelemetryEvent | null) => void;
  setSelectedAlert:       (a: Alert | null) => void;
  setSelectedIncidentId:  (id: string | null) => void;
  setHighlightedSystems:  (systems: string[]) => void;
  setHighlightedSystem:   (sys: string | null) => void;
  toggleSidebar:          () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedEvent:      null,
  selectedAlert:      null,
  selectedIncidentId: null,
  highlightedSystems: [],
  highlightedSystem:  null,
  sidebarCollapsed:   false,

  setSelectedEvent:      (selectedEvent)      => set({ selectedEvent }),
  setSelectedAlert:      (selectedAlert)      => set({ selectedAlert }),
  setSelectedIncidentId: (selectedIncidentId) => set({ selectedIncidentId }),
  setHighlightedSystems: (highlightedSystems) => set({ highlightedSystems }),
  setHighlightedSystem:  (highlightedSystem)  => set({ highlightedSystem }),
  toggleSidebar:         ()                   => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
