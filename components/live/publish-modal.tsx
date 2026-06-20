// PublishGameModal.tsx

import { GameRecordPlayerStats, Player } from "@/types/models";
import { AlertDialog, AlertDialogContent } from "../ui/alert-dialog";
import { PublishGameDidNotPlayStep } from "./did-not-play-form";
import { PublishGameFormStep } from "./game-details-form";
import { GameDetailsForm, PublishStep } from "@/hooks/use-publish-game";
import { toast } from "sonner";

interface PublishGameModalProps {
  // modal
  isOpen: boolean;
  step: PublishStep;
  isLoading: boolean;
  error: string | null;

  // form
  form: GameDetailsForm;
  updateForm: <K extends keyof GameDetailsForm>(key: K, value: GameDetailsForm[K]) => void;
  isFormValid: boolean;

  // stats
  teamAZeroStatPlayers?: GameRecordPlayerStats[];
  teamBZeroStatPlayers?: GameRecordPlayerStats[];

  // players
  teamAPlayers?: Player[];
  teamBPlayers?: Player[];
  winningTeamPlayers?: Player[];

  // did not play
  didNotPlayIds: string[];

  // handlers
  onToggle: (statId: string) => void;
  onNext: () => void;
  onBack: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const PublishGameModal = ({
  isOpen, step, isLoading, error,
  form, updateForm, isFormValid,
  teamAZeroStatPlayers, teamBZeroStatPlayers,
  teamAPlayers, teamBPlayers,
  winningTeamPlayers,
  didNotPlayIds,
  onToggle, onNext, onBack,
  onConfirm, onClose,
}: PublishGameModalProps) => {

  if( 
    !winningTeamPlayers ||
    !teamAZeroStatPlayers ||
    !teamBZeroStatPlayers ||
    !teamAPlayers ||
    !teamBPlayers
  ) {
    return
  }
  
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-h-[90vh] flex flex-col">
        {step === "form" ? (
          <PublishGameFormStep
            form={form}
            winningTeamPlayers={winningTeamPlayers}
            isFormValid={isFormValid}
            onUpdate={updateForm}
            onNext={onNext}
            onClose={onClose}
          />
        ) : (
          <PublishGameDidNotPlayStep
            teamAZeroStatPlayers={teamAZeroStatPlayers}
            teamBZeroStatPlayers={teamBZeroStatPlayers}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            didNotPlayIds={didNotPlayIds}
            isLoading={isLoading}
            error={error}
            onToggle={onToggle}
            onBack={onBack}
            onConfirm={onConfirm}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};