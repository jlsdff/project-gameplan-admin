import { GameRecordPlayerStats, StatAction, StatCommand, IncrementableStatKey } from "@/types/models";
import { collection, CollectionReference, doc, DocumentReference, DocumentSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";

class IncrementStat implements StatCommand {

    meta: StatAction;

    constructor(
        private stats: GameRecordPlayerStats[],
        private statDocId:string,
        private key: IncrementableStatKey,
        private liveStatId: string,
        private amount: number = 1
    ){
        this.meta = {
            liveStatId,
            statDocId,
            key,
            type: 'increment',
            amount,
            timestamp: new Date()
        }
    }

    private getTarget():GameRecordPlayerStats {

        const target = this.stats.find( s => s.id === this.statDocId )
        if(!target) throw new Error(`Stat doc ${this.statDocId} not found`)
        
        return target
    }


    execute(): void {
        (this.getTarget()[this.key] as number) += this.amount
    }

    undo(): void {
        (this.getTarget()[this.key] as number) -= this.amount
    }
    
}

class DecrementStat implements StatCommand {
        meta: StatAction;

    constructor(
        private stats: GameRecordPlayerStats[],
        private statDocId:string,
        private key: IncrementableStatKey,
        private liveStatId: string,
        private amount: number = 1
    ){
        this.meta = {
            liveStatId,
            statDocId,
            key,
            type: 'decrement',
            amount,
            timestamp: new Date()
        }
    }

    private getTarget():GameRecordPlayerStats {

        const target = this.stats.find( s => s.id === this.statDocId )
        if(!target) throw new Error(`Stat doc ${this.statDocId} not found`)
        
        return target
    }


    execute(): void {
        (this.getTarget()[this.key] as number) -= this.amount
    }

    undo(): void {
        (this.getTarget()[this.key] as number) += this.amount
    }
}

class CompositeStatCommand implements StatCommand {
  meta: StatAction;
  private commands: StatCommand[];

  constructor(commands: StatCommand[], primaryMeta: StatAction) {
    this.commands = commands;
    this.meta = primaryMeta;
  }

  execute(): void { this.commands.forEach((c) => c.execute()); }
  undo(): void    { this.commands.reverse().forEach((c) => c.undo()); }
}

const ATTEMPTED_KEY_MAP: Partial<Record<IncrementableStatKey, IncrementableStatKey>> = {
  threePointsMade: "threePointsAttempted",
  freeThrowsMade:  "freeThrowsAttempted",
  twoPointsMade:   "twoPointsAttempted",
};

export {
    IncrementStat,
    DecrementStat,
    CompositeStatCommand,
    ATTEMPTED_KEY_MAP
}