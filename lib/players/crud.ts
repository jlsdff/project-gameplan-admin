import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    endAt,
    DocumentData,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    QueryDocumentSnapshot,
    startAt,
    startAfter,
    updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { Player } from '@/types/models';

export const getPlayers = async () => {
    return await getDocs(collection(db, "players"))
}

export const getAllPlayers = async () => {
    const snapshot = await getDocs(collection(db, "players"));

    return snapshot.docs.map((playerDoc) => ({
        id: playerDoc.id,
        ...(playerDoc.data() as Player),
    }));
}

function toTitleCase(value: string) {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

export const searchPlayers = async (searchTerm: string, pageSize = 20) => {
    const normalizedTerm = searchTerm.trim();

    if (!normalizedTerm) {
        return [] as Array<Player & { id: string }>;
    }

    const playersCollection = collection(db, "players");
    const variants = Array.from(new Set([normalizedTerm, toTitleCase(normalizedTerm)]));

    const snapshots = await Promise.all(
        variants.flatMap((variant) => [
            getDocs(
                query(
                    playersCollection,
                    orderBy("lastname"),
                    startAt(variant),
                    endAt(`${variant}\uf8ff`),
                    limit(pageSize),
                ),
            ),
            getDocs(
                query(
                    playersCollection,
                    orderBy("firstname"),
                    startAt(variant),
                    endAt(`${variant}\uf8ff`),
                    limit(pageSize),
                ),
            ),
        ]),
    );

    const results = new Map<string, Player & { id: string }>();

    snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((playerDoc) => {
            results.set(playerDoc.id, {
                id: playerDoc.id,
                ...(playerDoc.data() as Player),
            });
        });
    });

    return Array.from(results.values())
        .sort((a, b) => {
            const aName = `${a.lastname} ${a.firstname}`.toLowerCase();
            const bName = `${b.lastname} ${b.firstname}`.toLowerCase();
            return aName.localeCompare(bName);
        })
        .slice(0, pageSize);
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
    const docRef = await addDoc(collection(db, "players"), player);
    return docRef.id;
}

export const updatePlayer = async (id: string, player: Player) => {
    const docRef = doc(db, "players", id);
    await updateDoc(docRef, player);
}

export const deletePlayer = async (id: string) => {
    const docRef = doc(db, "players", id);
    await deleteDoc(docRef);
}
