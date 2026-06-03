import { storage } from "@/lib/firebase/firebase";
import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytes,
} from "firebase/storage";

const IMAGE_FOLDER = "images";

type StoredImage = {
  fullPath: string;
  name: string;
  url: string;
  originalName: string;
};

function slugifyFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function getFileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.trim()?.toLowerCase();

  if (fromName && fromName !== file.name.toLowerCase()) {
    return fromName;
  }

  const mimeTypeExtensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };

  return mimeTypeExtensions[file.type] ?? "png";
}

function createStoredFileName(file: File) {
  const extension = getFileExtension(file);
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const normalizedBaseName = slugifyFileName(baseName) || "image";
  const uniqueSuffix =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${normalizedBaseName}-${Date.now()}-${uniqueSuffix}.${extension}`;
}

export async function listStoredImages(): Promise<StoredImage[]> {
  const folderRef = ref(storage, IMAGE_FOLDER);
  const snapshot = await listAll(folderRef);

  const images = await Promise.all(
    snapshot.items.map(async (item) => ({
      fullPath: item.fullPath,
      name: item.name,
      originalName: item.name,
      url: await getDownloadURL(item),
    })),
  );

  return images.sort((left, right) => left.name.localeCompare(right.name));
}

export async function uploadStoredImage(file: File): Promise<StoredImage> {
  const storedFileName = createStoredFileName(file);
  const fileRef = ref(storage, `${IMAGE_FOLDER}/${storedFileName}`);

  await uploadBytes(fileRef, file, {
    contentType: file.type || "application/octet-stream",
  });

  return {
    fullPath: fileRef.fullPath,
    name: storedFileName,
    originalName: file.name,
    url: await getDownloadURL(fileRef),
  };
}

export async function removeStoredImage(fullPath: string) {
  await deleteObject(ref(storage, fullPath));
}

export { IMAGE_FOLDER };