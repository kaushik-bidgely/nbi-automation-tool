import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

type Pilot = {
  id: number; code: string; name: string; is_master: boolean;
  action_count: number; insight_count: number; interaction_count: number;
};

const PilotContext = createContext<{
  pilotId: number | null;
  pilots: Pilot[];
  setPilotId: (id: number) => void;
  refreshPilots: () => void;
}>({ pilotId: null, pilots: [], setPilotId: () => {}, refreshPilots: () => {} });

export function PilotProvider({ children }: { children: ReactNode }) {
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [pilotId, setPilotIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem("pilotId");
    return saved ? Number(saved) : null;
  });

  const refreshPilots = () => {
    api.listPilots().then((rows: Pilot[]) => {
      setPilots(rows);
      const nonMaster = rows.filter((p) => !p.is_master);
      if (!pilotId || !rows.some((p) => p.id === pilotId)) {
        const fallback = nonMaster[0] ?? rows[0];
        if (fallback) setPilotIdState(fallback.id);
      }
    });
  };

  useEffect(() => { refreshPilots(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setPilotId = (id: number) => {
    localStorage.setItem("pilotId", String(id));
    setPilotIdState(id);
  };

  return (
    <PilotContext.Provider value={{ pilotId, pilots, setPilotId, refreshPilots }}>
      {children}
    </PilotContext.Provider>
  );
}

export function usePilot() {
  return useContext(PilotContext);
}
