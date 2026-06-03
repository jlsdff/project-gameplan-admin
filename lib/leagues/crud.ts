import { addDoc, collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase/firebase";
import { League } from "@/types/models";

export const createLeague = async (league: League) => {
  const docRef = await addDoc(collection(db, "leagues"), league);
  return docRef.id;
};

export const getLeague = async (id: string) => {
  const docRef = doc(db, "leagues", id);
  const snapshot = await getDoc(docRef);

  if (snapshot.exists()) {
    return snapshot.data() as League;
  }

  throw new Error("No such league!");
};

export const getLeagues = async () => {
  const snapshot = await getDocs(collection(db, "leagues"));

  return snapshot.docs.map((leagueDoc) => ({
    id: leagueDoc.id,
    ...(leagueDoc.data() as League),
  }));
};

export const updateLeague = async (id: string, league: League) => {
  const docRef = doc(db, "leagues", id);
  await updateDoc(docRef, league);
};