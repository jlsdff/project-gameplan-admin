"use client"

import useLiveStats from "@/hooks/live-stats-helper";
import useFetchLiveStats from "@/hooks/use-live-stats";
import { GameRecordPlayerStats, GameTeamStats, Player, Team } from "@/types/models";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { useEffect } from "react";
import { TeamOption, TeamSummaryCard } from "../games/GameEditor";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import {useStatTracker} from "@/hooks/use-stat-tracker";
import { Plus, Repeat2 } from "lucide-react";
import { Spinner } from "../ui/spinner";
import useSubstitution from "@/hooks/use-substitution";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { SubstitutionModal } from "./substitutionModal";
import { usePublishGame } from "@/hooks/use-publish-game";
import { PublishGameModal } from "./publish-modal";
import { createGame } from "@/lib/games/crud";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type TeamCardProps = {
    team?: Team;
    teamStats?: GameTeamStats;
}

type subPlayersHook = {
    benchPlayers: Player[] | undefined;
    selectedOutgoingPlayer: Player | null | undefined;
    isModalOpen: boolean;
    isLoading: boolean;
    error: string | null;
    selectOutgoing: (playerId: string) => void;
    confirmSwap: (incomingId: string) => Promise<void>;
    closeModal: () => void;
}



export default function LiveEditor({id}: {id:string}) {

    const router = useRouter();
    
    const { league, teamA, teamB, players } = useFetchLiveStats(id)

    const {
        snap,
        teamAPlayers,
        teamBPlayers,
        teamAStats,
        teamBStats,
        teamAPlayingPlayers,
        teamBPlayingPlayers,
        stats
    } = useLiveStats({id, league, teamA, teamB, players})

    const { increment, decrement, undo, canUndo, isLoading, error } = useStatTracker({liveStatId: snap?.id, stats: stats});

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "z") {
            e.preventDefault(); // prevent browser's default undo
            undo();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undo]);

    const subTeamA: subPlayersHook = useSubstitution({
        liveStatId: snap?.id,
        teamPlayers: teamAPlayers,
        playingPlayers: teamAPlayingPlayers,
        teamKey: "teamA",
    });

    const subTeamB: subPlayersHook = useSubstitution({
        liveStatId: snap?.id,
        teamPlayers: teamBPlayers,
        playingPlayers: teamBPlayingPlayers,
        teamKey: "teamB",
    });

    const {
        isModalOpen, step, isLoading:publishLoading, error: publishError,
        openModal, closeModal,
        form, updateForm, isFormValid, goNext,
        teamAZeroStatPlayers, teamBZeroStatPlayers,
        didNotPlayIds, toggleDidNotPlay,
        winningTeamPlayers,
        goBack, confirmPublish,
    } = usePublishGame({ 
        leagueId: league?.id,
        teamAId: snap?.data()?.teamAId,
        teamBId: snap?.data()?.teamBId,
        teamAStats: stats?.filter( st => teamA?.players.includes(st?.playerId ?? "") )
            ?.map( st => ({...st, id: st?.playerId})) as GameRecordPlayerStats[],
        teamBStats: stats?.filter( st => teamB?.players.includes(st?.playerId ?? "") )
            ?.map( st => ({...st, id: st?.playerId})) as GameRecordPlayerStats[],
        teamAPlayers: teamAPlayers,
        teamBPlayers: teamBPlayers,
        onPublish: async (input) => {

            await createGame(input)
                .then(() => {
                    toast.success("Game published.")
                    router.push("/games")
                })
                .catch((error) => {
                      const message =
                        typeof error === "object" && error !== null && "message" in error
                        ? String((error as { message?: string }).message)
                        : "";
                        toast.error(message ?? "Failed to publish the game. [main component]")
                })
            console.log("PUBLISHING GAME", input)
        }
     });


    return (
        <>
            <main>

            <section className="flex gap-4 p-4">


                {
                    teamAStats ? (
                        <TeamSummaryCard title="Team A Summary" team={teamA as TeamOption} stats={teamAStats} />
                    ) : (
                        <div>
                            <Skeleton className="w-full" />
                        </div>
                    )
                }
                {
                    teamBStats ? (
                        <TeamSummaryCard title="Team B Summary" team={teamB as TeamOption} stats={teamBStats} />
                    ) : (
                        <div>
                            <Skeleton className="w-full" />
                        </div>
                    )
                }

            </section>



            <section className="">

                <div className="grid grid-cols-12 gap-4 p-4 ">
                    <div className="col-span-6 border border-slate-500 rounded-md p-4">
                        <StatContainer 
                            stats={stats}
                            playingPlayers={teamAPlayingPlayers}
                            players={teamAPlayers}
                            liveStatId={snap?.id}
                            increment={increment}
                            decrement={decrement}
                            isLoading={isLoading}
                            subTeam={subTeamA}
                        />
                    </div>

                    <div className="col-span-6 col-start-7 border border-slate-500 rounded-md p-4">
                        <StatContainer 
                            stats={stats}
                            playingPlayers={teamBPlayingPlayers}
                            players={teamBPlayers}
                            liveStatId={snap?.id}
                            increment={increment}
                            decrement={decrement}
                            isLoading={isLoading}
                            subTeam={subTeamB}
                        />
                    </div>
                </div>
                
            </section>
            <section className="flex gap-2 border border-slate-500 mx-4 rounded-md px-4 py-2 mb-12 justify-between">
                <div className=" rounded-md">
                    <Button 
                        className={`w-full`}
                        disabled={isLoading || !canUndo}
                        onClick={() => {
                            if(canUndo) {
                                undo()
                            }
                        }}
                    >
                        {
                            isLoading ? 
                                (<><Spinner /> Loading... </>) :
                                "Undo"
                        }
                    </Button>
                </div>
                <div className="" >
                    <Button
                        className="bg-green-700 hover:bg-green-800 cursor-pointer"
                        onClick={openModal}
                    >
                        Publish Game
                    </Button>
                </div>
            </section>
        </main>

        <SubstitutionModal
            isOpen={subTeamA.isModalOpen}
            isLoading={subTeamA.isLoading}
            error={subTeamA.error}
            outgoingPlayer={subTeamA.selectedOutgoingPlayer ?? null}
            benchPlayers={subTeamA  .benchPlayers}
            onSelect={subTeamA.confirmSwap}
            onClose={subTeamA.closeModal}
        />

        <SubstitutionModal
            isOpen={subTeamB.isModalOpen}
            isLoading={subTeamB.isLoading}
            error={subTeamB.error}
            outgoingPlayer={subTeamB.selectedOutgoingPlayer ?? null}
            benchPlayers={subTeamB.benchPlayers}
            onSelect={subTeamB.confirmSwap}
            onClose={subTeamB.closeModal}
        />

        <PublishGameModal 
            isOpen={isModalOpen}
            step={step}
            isLoading={publishLoading}
            error={publishError}
            form={form}
            updateForm={updateForm}
            isFormValid={isFormValid}
            teamAZeroStatPlayers={teamAZeroStatPlayers}
            teamBZeroStatPlayers={teamBZeroStatPlayers}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            winningTeamPlayers={winningTeamPlayers}
            didNotPlayIds={didNotPlayIds}
            onToggle={toggleDidNotPlay}
            onNext={goNext}
            onBack={goBack}
            onConfirm={confirmPublish}
            onClose={closeModal}
        />
        </>
    )
}

interface StatContainerProps {
    stats?: GameRecordPlayerStats[];
    playingPlayers?: string[];
    players?: Player[];
    liveStatId?: string;
    isLoading: boolean;
    subTeam: subPlayersHook;
    increment(docId: string, statkey: string): Promise<void>;
    decrement(docId: string, statkey: string): Promise<void>;
}

function StatContainer({
    stats, playingPlayers, players, liveStatId, isLoading, subTeam, increment, decrement
}: StatContainerProps ) {


    function getPlayerData(pl:string) {
        if(!players) return;
        return players.find( p => p.id === pl) as Player
    }

    function getPlayerStat(pl:string) {
        if(!stats) return;
        return stats.find( st => st.playerId === pl) as GameRecordPlayerStats
    }
    
    if(
        !stats || !playingPlayers || !players || !liveStatId 
    ) {
        // TODO: ADD A SKELETON
        return <div>loading...</div>
    }

    return (
        <div className="flex flex-col gap-2">
            {
                playingPlayers.map( pl => (
                    <PlayerCard 
                        key={pl}
                        liveStatId={liveStatId}
                        stats={stats}
                        playerStat={getPlayerStat(pl)}
                        data={getPlayerData(pl)}
                        increment={increment}
                        decrement={decrement}
                        isLoading={isLoading}
                        onSubstitute={() => subTeam.selectOutgoing(pl)}
                    />
                ))
            }
        </div>
    )
    
}

interface PlayerCardProps {
    liveStatId: string;
    stats: GameRecordPlayerStats[];
    playerStat?: GameRecordPlayerStats;
    data?: Player;
    isLoading: boolean;
    onSubstitute(): void; 
    increment(docId: string, statkey: string): Promise<void>;
    decrement(docId: string, statkey: string): Promise<void>;
}

function PlayerCard({
    liveStatId,
    stats,
    playerStat,
    data,
    isLoading,
    onSubstitute,
    increment,
    decrement
}: PlayerCardProps) {


    const renderName = () => {
        const firstname = data?.firstname
        const lastname = data?.lastname
        const number = data?.number

        if(!firstname){
            return `${lastname} ${number ? `#${number}` : ""}`
        }
        return `${lastname}, ${firstname} ${number ? `#${number}` : ""}`
    }

    if(
        !liveStatId || !stats || !playerStat || !data
    ) {
        //TODO: MAKE A SKELETON
        return (
            <div>
                loading...
            </div>
        )
    }


    return (
        <Card className="p-4">

            <CardHeader>
                <CardTitle>
                    <div className="flex justify-start items-center gap-4 w-full">
                        {renderName()}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size={'icon-xs'} className="" onClick={() => onSubstitute()} >
                                    <Repeat2 />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                Substitute
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </CardTitle>
                <CardContent className="p-0">

                    <div className="flex gap-1 justify-start  ">
                        <Stat label='PTS' value={playerStat?.freeThrowsMade + (playerStat?.threePointsMade * 3) + (playerStat?.twoPointsMade * 2)} />
                        <Stat label='AST' value={playerStat?.assists} />
                        <Stat label='REB' value={playerStat?.rebounds} />
                        <Stat label='BLK' value={playerStat?.blocks} />
                        <Stat label='STL' value={playerStat?.steals} />
                        <Stat label='FLS' value={playerStat?.fouls} />
                        <Stat label='TO' value={playerStat?.turnovers} />
                        <Stat label='FG' value={`${playerStat.twoPointsMade}/${playerStat.twoPointsAttempted + playerStat.threePointsAttempted}`} />
                        <Stat label='2FG' value={`${playerStat.twoPointsMade}/${playerStat.twoPointsAttempted}`} />
                        <Stat label='3FG' value={`${playerStat.threePointsMade}/${playerStat.threePointsAttempted}`} />
                        <Stat label='FT' value={`${playerStat.freeThrowsMade}/${playerStat.freeThrowsAttempted}`} />

                    </div>

                </CardContent>
                <CardFooter className="p-0 flex flex-wrap gap-1">
                    <StatButtonGroup
                        label="2FG"
                        plus={() => {
                            increment(playerStat.id, 'twoPointsMade')
                        }}
                        minus={() => increment(playerStat.id, 'twoPointsAttempted')}
                        isLoading={isLoading}
                    />
                    <StatButtonGroup
                        label="3FG"
                        plus={() => {
                            increment(playerStat.id, 'threePointsMade')
                        }}
                        minus={() => increment(playerStat.id, 'threePointsAttempted')}
                        isLoading={isLoading}
                    />
                    <StatButtonGroup
                        label="FT"
                        plus={() => increment(playerStat.id, 'freeThrowsMade')}
                        minus={() => increment(playerStat.id, 'freeThrowsAttempted')}
                        isLoading={isLoading}
                    />
                    <StatButton
                        label="AST"
                        plus={() => increment(playerStat.id, 'assists')}
                        isLoading={isLoading}
                    />
                    <StatButton
                        label="REB"
                        plus={() => increment(playerStat.id, 'rebounds')}
                        isLoading={isLoading}
                    />
                    <StatButton
                        label="BLK"
                        plus={() => increment(playerStat.id, 'blocks')}
                        isLoading={isLoading}
                    />
                    <StatButton
                        label="STL"
                        plus={() => increment(playerStat.id, 'steals')}
                        isLoading={isLoading}
                    />
                    <StatButton
                        label="FLS"
                        plus={() => increment(playerStat.id, 'fouls')}
                        isLoading={isLoading}
                    />
                    <StatButton
                        label="TO"
                        plus={() => increment(playerStat.id, 'turnovers')}
                        isLoading={isLoading}
                    />
                </CardFooter>
            </CardHeader>

        </Card>
    )
}

interface StatProps {
    value: number | string;
    label: string;
}

function Stat({label, value}: StatProps){

    return (
        <div className="flex flex-col gap-1 text-center border border-slate-200 rounded-sm p-2 shadow-sm">
            <div>
                <h5 className="text-xs">{label}</h5>
            </div>
            <div>
                <h6 className="text-xs font-medium ">{value}</h6>
            </div>
        </div>
    )
}

interface StatButtonProps {
    label: string;
    plus(): void;
    isLoading: boolean;
}


function StatButton(
    {label, plus, isLoading}:StatButtonProps
) {

    return (
        <div className="border border-slate-300 rounded-sm p-2 text-center bg-slate-900 text-slate-200 ">

            <div className="mb-2">
                <h5 className="text-xs">
                    {label}
                </h5>
            </div>

            <ButtonGroup>
                <Button className="text-slate-900 cursor-pointer hover:bg-slate-400 hover:text-shadow-slate-900 px-4 w-full" 
                    size="icon-xs" 
                    variant="outline" 
                    onClick={() => plus()}
                    disabled={isLoading}
                    
                >
                        {
                            isLoading ? <Spinner /> : <Plus />
                        }
                </Button>
            </ButtonGroup>

        </div>
    )
}

interface StatButtonGroupProps {
    label: string;
    plus(): void;
    minus(): void;
    isLoading: boolean;
}

function StatButtonGroup({label, plus, minus, isLoading}:StatButtonGroupProps) {

    return (
        <div className="border border-slate-300 rounded-sm p-2 text-center bg-slate-900 text-slate-200 ">

            <div className="mb-2">
                <h5 className="text-xs">
                    {label}
                </h5>
            </div>

            <ButtonGroup>
                <Button className="text-slate-800 cursor-pointer hover:bg-slate-400 hover:text-shadow-slate-900 text-xs" 
                    size="xs" 
                    variant="outline" 
                    onClick={() => plus()}
                    disabled={isLoading}
                >
                        MD
                </Button>
                <Button className="text-slate-800 cursor-pointer hover:bg-slate-400 hover:text-shadow-slate-900 text-xs" 
                    size="xs" 
                    variant="outline" 
                    onClick={() => minus()}
                    disabled={isLoading}
                >
                        AT
                </Button>
            </ButtonGroup>

        </div>
    )

}

