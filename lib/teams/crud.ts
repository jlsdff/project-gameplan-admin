import {
  addDoc,
  collection,
  DocumentData,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  updateDoc,
} from "firebase/firestore";

import { Team } from "@/types/models";
import { db } from "@/lib/firebase/firebase";

export const createTeam = async (team: Team) => {
  await addDoc(collection(db, "teams"), team);
};

export const getTeam = async (id: string) => {
  const teamSnapshot = await getDoc(doc(db, "teams", id));

  if (!teamSnapshot.exists()) {
    throw new Error("No such team!");
  }

  return {
    id: teamSnapshot.id,
    ...(teamSnapshot.data() as Team),
  };
};

export const updateTeam = async (id: string, team: Team) => {
  await updateDoc(doc(db, "teams", id), team);
};

export const deleteTeam = async (id: string) => {
  await deleteDoc(doc(db, "teams", id));
};

export const getTeams = async () => {
  const teamsCollection = collection(db, "teams");
  const teamsQuery = query(teamsCollection, orderBy("teamName"));
  const snapshot = await getDocs(teamsQuery);

  return snapshot.docs.map((teamDoc) => ({
    id: teamDoc.id,
    ...(teamDoc.data() as Team),
  }));
};

export type TeamsPage = {
  teams: Array<Team & { id: string }>;
  lastVisible: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export const getTeamsPage = async (
  pageSize = 20,
  lastVisible: QueryDocumentSnapshot<DocumentData> | null = null,
): Promise<TeamsPage> => {
  const teamsCollection = collection(db, "teams");
  const teamsQuery = lastVisible
    ? query(teamsCollection, orderBy("teamName"), startAfter(lastVisible), limit(pageSize))
    : query(teamsCollection, orderBy("teamName"), limit(pageSize));

  const snapshot = await getDocs(teamsQuery);
  const teams = snapshot.docs.map((teamDoc) => ({
    id: teamDoc.id,
    ...(teamDoc.data() as Team),
  }));

  return {
    teams,
    lastVisible: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
    hasMore: snapshot.docs.length === pageSize,
  };
};

export const getTeamsByIds = async (teamIds: string[]) => {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));

  const snapshots = await Promise.all(
    uniqueTeamIds.map((teamId) => getDoc(doc(db, "teams", teamId))),
  );

  return snapshots
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => ({
      id: snapshot.id,
      ...(snapshot.data() as Team),
    }));
};