"use client"

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form } from "@/components/ui/form";
import useFetchOngoingLeagues from "@/hooks/use-fetch-ongoing-leagues";
import useFetchParticipatingTeams from "@/hooks/fetch-participating-teams";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldContent, FieldLabel, FieldError } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {createLiveStats} from "@/lib/live-stats/crud";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const formSchema = z.object({
    leagueId: z
        .string()
        .min(1, "Select a league")
        .nonempty("League is required"),
    teamAId: z
        .string()
        .nonempty("Team A is required"),
    teamBId: z
        .string()
        .nonempty("Team B is required"),
})

const EMPTY_FORM_VALUES: z.infer<typeof formSchema> = {
    leagueId: "",
    teamAId: "",
    teamBId: "",
}

export default function NewLivePage() {

    return (
        <main>
            <GameForm />
        </main>
    )
}


function GameForm() {

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: EMPTY_FORM_VALUES
    })

    const router = useRouter();
    const { leagues, loading, error} = useFetchOngoingLeagues();
    const selectedLeagueId = form.watch('leagueId');
    const { teams, loading: teamsLoading, error:teamsError } = useFetchParticipatingTeams(
        leagues.find( league => league.id === selectedLeagueId) ?? null
    );


    const handleSubmit = async (data: z.infer<typeof formSchema>) => {

        try {

            const teamA = teams.find( team => team.id == data.teamAId)
            const teamB = teams.find( team => team.id == data.teamBId)

            if(!teamA || !teamB) {
                throw new Error("Selected team is not participating in the selected league")
            }
            
            const players = [...teamA.players, ...teamB.players]
                .map( p => ({
                        assists: 0,
                        blocks: 0,
                        fouls: 0,
                        freeThrowsAttempted: 0,
                        freeThrowsMade: 0,
                        id: p,
                        rebounds: 0,
                        steals: 0,
                        threePointsAttempted: 0,
                        threePointsMade: 0,
                        turnovers: 0,
                        twoPointsAttempted: 0,
                        twoPointsMade: 0,
                }))


            const startingPlayers = {
                teamA: teamA.players.slice(0,5),
                teamB: teamB.players.slice(0,5)
            }

            const docId = await createLiveStats({...data, status: false, stats: players, playingPlayers: startingPlayers})
            toast.success("Live Stats Created")
            router.push(`edit/${docId}`)
        } catch(error: unknown) {
            const message =
                typeof error === "object" && error !== null && "message" in error
                ? String((error as { message?: string }).message)
                : "";
            toast.error(message)
        }

    }
    

    return (
        <div className="max-w-3xl mx-auto p-4">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                    <div className="grid w-full items-center gap-6 max-w-3xl border border-slate-300 shadow-2xl rounded-xl p-6">
                        
                        {/* LEAGUE CONTROLLER */}
                        <Controller 
                            name="leagueId"
                            control={form.control}
                            render={ ({field, fieldState}) => (
                                <Field orientation={'responsive'} data-invalid={fieldState.invalid}>
                                    <FieldContent>
                                        <FieldLabel>League</FieldLabel>
                                    </FieldContent>
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}

                                <Select
                                    name={field.name}
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={loading}
                                >
                                    <SelectTrigger
                                        id="form-rhf-select-league"
                                        aria-invalid={fieldState.invalid}
                                    >
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>

                                    <SelectContent>
                                        {
                                            leagues.map( league => (
                                                <SelectItem 
                                                    key={league.id as string}
                                                    id={league.id as string}
                                                    value={league.id as string}
                                                >
                                                    {league.title}
                                                </SelectItem>
                                            ))
                                        }
                                    </SelectContent>
                                    
                                </Select>


                                </Field>
                            )}
                        />
                        
                        {/* TEAM A CONTROLLER */}
                        <Controller 
                            name='teamAId'
                            control={form.control}
                            render={ ({field, fieldState}) => (
                                <Field orientation={'responsive'} data-invalid={fieldState.invalid}>
                                    <FieldContent>
                                        <FieldLabel>TEAM A</FieldLabel>
                                    </FieldContent>
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}

                                <Select
                                    name={field.name}
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={teamsLoading}
                                >
                                    <SelectTrigger
                                        id="form-rhf-select-league"
                                        aria-invalid={fieldState.invalid}
                                    >
                                        <SelectValue placeholder={loading ? "Please select a league": "Select"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {
                                            teamsLoading ? (
                                                <SelectItem disabled value="">
                                                    Loading teams...
                                                </SelectItem>
                                            ) : teamsError ? (
                                                <SelectItem disabled value="">
                                                    Error loading teams
                                                </SelectItem>
                                            ) : (
                                                teams.map( team => (
                                                    <SelectItem 
                                                        key={team.id as string}
                                                        id={team.id as string}
                                                        value={team.id as string}
                                                    >
                                                        {team.teamName}
                                                    </SelectItem>
                                                ))
                                            )
                                        }
                                    </SelectContent>
                                </Select>
                                </Field>
                            )}
                        />

                        {/* TEAM B CONTROLLER */}
                        <Controller 
                            name='teamBId'
                            control={form.control}
                            render={ ({field, fieldState}) => (
                                <Field orientation={'responsive'} data-invalid={fieldState.invalid}>
                                    <FieldContent>
                                        <FieldLabel>TEAM B</FieldLabel>
                                    </FieldContent>
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}

                                <Select
                                    name={field.name}
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={teamsLoading}
                                >
                                    <SelectTrigger
                                        id="form-rhf-select-league"
                                        aria-invalid={fieldState.invalid}
                                    >
                                        <SelectValue placeholder={loading ? "Please select a league": "Select"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {
                                            teamsLoading ? (
                                                <SelectItem disabled value="">
                                                    Loading teams...
                                                </SelectItem>
                                            ) : teamsError ? (
                                                <SelectItem disabled value="">
                                                    Error loading teams
                                                </SelectItem>
                                            ) : (
                                                teams.map( team => (
                                                    <SelectItem 
                                                        key={team.id as string}
                                                        id={team.id as string}
                                                        value={team.id as string}
                                                    >
                                                        {team.teamName}
                                                    </SelectItem>
                                                ))
                                            )
                                        }
                                    </SelectContent>
                                </Select>
                                </Field>
                            )}
                        />



                        
                        <Button    
                            type="submit"
                            disabled={form.formState.isSubmitting}
                        >
                            {form.formState.isSubmitting ? (
                                <span>
                                    <Spinner className="size-4" />
                                    Creating...
                                </span>
                            ) : "Create Live Stats"}
                        </Button>



                    </div>

                </form>
            </Form>
        </div>
    )
}