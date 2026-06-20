// SubstitutionModal.tsx

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Player } from "@/types/models";

interface SubstitutionModalProps {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  outgoingPlayer: Player | null;
  benchPlayers?: Player[];
  onSelect: (incomingId: string) => void;
  onClose: () => void;
}

export const SubstitutionModal = ({
  isOpen,
  isLoading,
  error,
  outgoingPlayer,
  benchPlayers,
  onSelect,
  onClose,
}: SubstitutionModalProps) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-h-[90vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>Select Replacement</AlertDialogTitle>
          <AlertDialogDescription>
            Substituting out:{" "}
            <strong>
              #{outgoingPlayer?.number} {outgoingPlayer?.lastname}, {outgoingPlayer?.firstname}
            </strong>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {benchPlayers?.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No bench players available
          </p>
        ) : (
          <div className="overflow-y-auto flex-1 pr-1">
            <div className="grid grid-cols-2 gap-2">
              {benchPlayers?.map((player) => (
                <button
                  key={player.id}
                  disabled={isLoading}
                  onClick={() => onSelect(player.id ?? "")}
                  className="flex items-center gap-2 rounded-md border px-3 py-3 text-left hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  <span className="font-bold text-sm shrink-0">#{player.number}</span>
                  <span className="text-sm truncate">
                    {player.lastname}, {player.firstname}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <AlertDialogCancel
          disabled={isLoading}
          onClick={onClose}
          className="mt-2"
        >
          Cancel
        </AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog>
  );
};