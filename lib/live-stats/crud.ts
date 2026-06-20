
import { League, LiveStatsForm, Player, Team } from "@/types/models";
import { db } from "../firebase/firebase";
import { addDoc, collection, getDoc, doc, getDocs, DocumentSnapshot, orderBy, query, limit, startAfter, QueryDocumentSnapshot, DocumentData, deleteDoc } from "firebase/firestore";

export async function createLiveStats(data: LiveStatsForm) {

    const ref = collection(db, "live-stats");

    const {stats, ...rest} = data;

    const doc = await addDoc(ref, {
        ...rest,
        createdAt: new Date()
    }); 

    stats?.forEach( async (stat) => {
        await addDoc(collection(doc, 'stats'), stat)
    });
   
    return doc.id;
}


export async function getInitialData(id: string) {

    let league: League;
    let teamA: Team;
    let teamB: Team;
    let players: Player[];

    const liveStatDoc = await getDoc(doc(db, 'live-stats', id))
        .then( (doc) => {
            if(!doc.exists()){
                throw new Error("Live stat Document not found")
            }
            return doc.data()
        })
        .catch( error => {
            throw new Error("Error fetching data.")
        } )
    

    const leagueRef = doc(collection(db, "leagues"), liveStatDoc.leagueId)
    const leagueDoc = await getDoc(leagueRef)
    if(!leagueDoc.exists()){
        throw new Error("League does not exist")
    }else {
        league = {
            id: leagueDoc.id,
            ...(leagueDoc.data() as Omit<League, "id">)
        } as League
    }

    const teamARef = doc(collection(db, 'teams'), liveStatDoc.teamAId)
    const teamADoc = await getDoc(teamARef);
    if(!teamADoc.exists()){
        throw new Error("TeamA does not exist")
    } else {
        teamA = {
            id: teamADoc.id,
            ...(teamADoc.data() as Omit<Team, "id">)
        } as Team
    }

    const teamBRef = doc(collection(db, 'teams'), liveStatDoc.teamBId)
    const teamBDoc = await getDoc(teamBRef)
    if(!teamBDoc.exists()){
        throw new Error("TeamB does not exist")
    } else {
        teamB = {
            id: teamBDoc.id,
            ...(teamBDoc.data() as Omit<Team, "id">)
        } as Team
    }

    const allPlayers = [...teamA.players, ...teamB.players];
    const playersDocs = await Promise.all(
        allPlayers.map( id => getDoc(doc(db, 'players', id)))
    )
    players = playersDocs
        .filter( doc => doc.exists())
        .map( doc => ({id: doc.id, ...( doc.data() as Omit<Player, 'id'> )} as Player))

    return {
        league,
        teamA,
        teamB,
        players
    }

}

export async function getLiveStats() {

    const liveCollectionRef = collection(db, 'live-stats')

    const liveStats = await getDocs(liveCollectionRef)
    
    return liveStats;
}

export type LiveStatPage = {
    liveStats: Array<LiveStatsForm & { id: string }>,
    lastVisible: QueryDocumentSnapshot<DocumentData> | null;
    hasMore: boolean
}

export async function getInifiniteLiveStats( 
    pageSize = 10,
    lastVisible: QueryDocumentSnapshot<DocumentData> | null = null
 ): Promise<LiveStatPage> {

    const liveCollection = collection(db, 'live-stats')

    let queryRef = lastVisible
        ? query(liveCollection, orderBy("createdAt", 'desc'), startAfter(lastVisible), limit(pageSize))
        : query(liveCollection, orderBy("createdAt", 'desc'), limit(pageSize));

    const snapshot = await getDocs(queryRef)

    const liveStats = snapshot.docs.map( st => ({
        id: st.id,
        ...st.data()
    }))

    return {
        liveStats: liveStats as ({id:string} & LiveStatsForm)[],
        lastVisible: snapshot.docs.length > 0 
            ? snapshot.docs[snapshot.docs.length - 1]
            : null,
        hasMore: snapshot.docs.length === pageSize
    }
    
}

export async function deleteLiveStats(id:string) {

    return await deleteDoc(doc(db, 'live-stats', id))
     
}