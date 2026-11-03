import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Loads the signed-in user's profile plus a temporary link
 * to their photo from the private avatars bucket.
 */
export function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-profile", userId],
    enabled: !!userId,

    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      let photo: string | null = null;

      if (data.avatar_url) {
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from("avatars")
          .createSignedUrl(data.avatar_url, 60 * 60);

        if (signedUrlError) {
          console.error("Could not load profile photo:", signedUrlError);
        } else {
          photo = signedUrlData?.signedUrl ?? null;
        }
      }

      return {
        ...data,
        photo,
      };
    },
  });
}

/**
 * Generates initials from a name or email.
 */
export function initials(name: string | null | undefined, email: string | null | undefined) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);

  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
