import { GameRecordPlayerStats, IncrementableStatKey, StatCommand } from "@/types/models";
import { doc, increment, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { ATTEMPTED_KEY_MAP, CompositeStatCommand, DecrementStat, IncrementStat } from "./stat-command";

class StatTracker {
  private history: StatCommand[] = [];

  private getStatDocRef(liveStatId: string, statDocId: string) {
    return doc(db, "live-stats", liveStatId, "stats", statDocId);
  }

  public buildCommand(
    stats: GameRecordPlayerStats[],
    statDocId: string,
    key: IncrementableStatKey,
    liveStatId: string,
    type: "increment" | "decrement",
    amount: number
  ): StatCommand {
    const CommandClass = type === "increment" ? IncrementStat : DecrementStat;
    const primaryCommand = new CommandClass(stats, statDocId, key, liveStatId, amount);

    const attemptedKey = ATTEMPTED_KEY_MAP[key];

    // If key has a paired attempted stat, wrap both in a composite
    if (attemptedKey) {
      const attemptedCommand = new CommandClass(stats, statDocId, attemptedKey, liveStatId, amount);
      return new CompositeStatCommand(
        [primaryCommand, attemptedCommand],
        primaryCommand.meta
      );
    }

    return primaryCommand;
  }

  async execute(command: StatCommand): Promise<void> {
    command.execute();

    const { liveStatId, statDocId, key, type, amount } = command.meta;
    const attemptedKey = ATTEMPTED_KEY_MAP[key];

    const updates: Record<string, ReturnType<typeof increment>> = {
      [key]: increment(type === "increment" ? amount : -amount),
    };

    // Include attempted key in the same Firestore write
    if (attemptedKey) {
      updates[attemptedKey] = increment(type === "increment" ? amount : -amount);
    }

    await updateDoc(this.getStatDocRef(liveStatId, statDocId), updates);
    this.history.push(command);
  }

  async undo(): Promise<void> {
    const last = this.history.pop();
    if (!last) return;

    last.undo();

    const { liveStatId, statDocId, key, type, amount } = last.meta;
    const attemptedKey = ATTEMPTED_KEY_MAP[key];

    const updates: Record<string, ReturnType<typeof increment>> = {
      [key]: increment(type === "increment" ? -amount : amount),
    };

    if (attemptedKey) {
      updates[attemptedKey] = increment(type === "increment" ? -amount : amount);
    }

    await updateDoc(this.getStatDocRef(liveStatId, statDocId), updates);
  }

  hasHistory(): boolean {
    return this.history.length > 0;
  }
}

export {
    StatTracker
}