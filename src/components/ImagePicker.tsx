import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Shrinks a photo to max 1000px JPEG and returns it as a data URL (stored on the row). */
export async function compressImage(file: File, max = 1000): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImagePicker({
  value,
  fallback,
  onChange,
}: {
  value: string;
  fallback?: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const shown = value || fallback;
  return (
    <div className="flex items-center gap-3">
      {shown ? (
        <img src={shown} alt="Preview" className="h-16 w-24 rounded-md object-cover" />
      ) : (
        <div className="h-16 w-24 rounded-md bg-secondary" />
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => ref.current?.click()}>
          {value ? "Change photo" : "Upload photo"}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
            Remove
          </Button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (!f.type.startsWith("image/")) return void toast.error("Please choose an image file.");
          try {
            onChange(await compressImage(f));
          } catch {
            toast.error("Couldn't read that image.");
          }
        }}
      />
    </div>
  );
}
