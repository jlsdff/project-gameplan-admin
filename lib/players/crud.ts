import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    DocumentData,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    QueryDocumentSnapshot,
    startAfter,
    updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { Player } from '@/types/models';

export const getPlayers = async () => {
    return await getDocs(collection(db, "players"))
}

export type PlayersPage = {
    players: Array<Player & { id: string }>;
    lastVisible: QueryDocumentSnapshot<DocumentData> | null;
    hasMore: boolean;
}

export const getPlayersPage = async (
    pageSize = 20,
    lastVisible: QueryDocumentSnapshot<DocumentData> | null = null,
): Promise<PlayersPage> => {
    const playersCollection = collection(db, "players");
    const playersQuery = lastVisible
        ? query(playersCollection, orderBy("lastname"), startAfter(lastVisible), limit(pageSize))
        : query(playersCollection, orderBy("lastname"), limit(pageSize));

    const snapshot = await getDocs(playersQuery);
    const players = snapshot.docs.map((playerDoc) => ({
        id: playerDoc.id,
        ...(playerDoc.data() as Player),
    }));

    return {
        players,
        lastVisible: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
        hasMore: snapshot.docs.length === pageSize,
    };
}

export const getPlayer = async (id: string) => {
    const docRef = doc(db, "players", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data() as Player;
    }
    throw new Error("No such player!");
}


export const createPlayer = async (player: Player) => {
    await addDoc(collection(db, "players"), player);
}

export const updatePlayer = async (id: string, player: Player) => {
    const docRef = doc(db, "players", id);
    await updateDoc(docRef, player);
}

export const deletePlayer = async (id: string) => {
    const docRef = doc(db, "players", id);
    await deleteDoc(docRef);
}
