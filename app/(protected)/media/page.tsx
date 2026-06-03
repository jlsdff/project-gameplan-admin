"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  IMAGE_FOLDER,
  listStoredImages,
  removeStoredImage,
  uploadStoredImage,
} from "@/lib/storage/images";
import { AlertTriangle, ExternalLink, ImageUp, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type StoredImage = {
  fullPath: string;
  name: string;
  url: string;
  originalName: string;
};

function getFriendlyImageErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return "You do not have permission to manage images.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  return "Unable to manage images right now. Please try again.";
}

export default function MediaPage() {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hasImages = images.length > 0;

  const sortedImages = useMemo(
    () => [...images].sort((left, right) => left.name.localeCompare(right.name)),
    [images],
  );

  const refreshImages = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const nextImages = await listStoredImages();
      setImages(nextImages);
    } catch (fetchError) {
      const friendlyError = getFriendlyImageErrorMessage(fetchError);
      setError(friendlyError);
      toast.error(friendlyError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshImages();
  }, [refreshImages]);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast.error("Please select one or more image files.");
      setUploadInputKey((current) => current + 1);
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const uploadedImages: StoredImage[] = [];

      for (const file of imageFiles) {
        const uploadedImage = await uploadStoredImage(file);
        uploadedImages.push(uploadedImage);
      }

      setImages((current) => [...uploadedImages, ...current]);
      toast.success(
        uploadedImages.length === 1
          ? "Image uploaded to storage."
          : `${uploadedImages.length} images uploaded to storage.`,
      );
    } catch (uploadError) {
      const friendlyError = getFriendlyImageErrorMessage(uploadError);
      setError(friendlyError);
      toast.error(friendlyError);
    } finally {
      setIsUploading(false);
      setUploadInputKey((current) => current + 1);
    }
  }

  async function handleDeleteImage(image: StoredImage) {
    const confirmed = window.confirm(
      `Delete ${image.name}? This permanently removes the file from Firebase Storage.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await removeStoredImage(image.fullPath);
      setImages((current) => current.filter((item) => item.fullPath !== image.fullPath));
      toast.success("Image deleted.");
    } catch (deleteError) {
      const friendlyError = getFriendlyImageErrorMessage(deleteError);
      toast.error(friendlyError);
      setError(friendlyError);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.24),transparent_42%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-8 md:px-8">
      <section className="mx-auto flex max-w-7xl flex-col gap-6 rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Media</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Upload, view, and clean up storage images.
            </h1>
            <p className="text-sm text-slate-600 md:text-base">
              Files are stored in the <span className="font-medium text-slate-900">{IMAGE_FOLDER}</span> path in Firebase Storage.
              Uploaded filenames are renamed automatically before they are saved.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => void refreshImages()} disabled={isLoading}>
              {isLoading ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
              Refresh
            </Button>
            <Button asChild variant="outline">
              <Link href="/">
                <ExternalLink className="size-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Deletions are permanent. The page also shows a confirmation warning before removing any file.
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-950">Upload images</h2>
              <p className="text-sm text-slate-600">
                Select one or more images. Each file is renamed before it is uploaded to avoid collisions.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Choose image files</span>
                <Input
                  key={uploadInputKey}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={isUploading}
                  onChange={(event) => void handleUpload(event)}
                  className="cursor-pointer file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                />
              </label>

              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Stored path</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">/{IMAGE_FOLDER}</p>
              </div>

              {isUploading && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Spinner />
                  Uploading image files...
                </div>
              )}

              {error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Library</h2>
                <p className="text-sm text-slate-600">
                  {hasImages ? `${images.length} image${images.length === 1 ? "" : "s"} available.` : "No images uploaded yet."}
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
                ))}
              </div>
            ) : sortedImages.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sortedImages.map((image) => (
                  <article key={image.fullPath} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="aspect-4/3 bg-slate-100">
                      <img
                        src={image.url}
                        alt={image.originalName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="space-y-1">
                        <p className="truncate text-sm font-semibold text-slate-950" title={image.name}>
                          {image.name}
                        </p>
                        <p className="truncate text-xs text-slate-500" title={image.originalName}>
                          Uploaded from {image.originalName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button asChild size="sm" variant="outline" className="flex-1">
                          <a href={image.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" />
                            View
                          </a>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDeleteImage(image)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                <ImageUp className="size-12 text-slate-400" />
                <h3 className="mt-4 text-lg font-semibold text-slate-950">No images yet</h3>
                <p className="mt-2 max-w-md text-sm text-slate-600">
                  Upload one or more images to populate the library. They will appear here after Firebase Storage saves them.
                </p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
