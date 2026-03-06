// Server component — required for generateStaticParams with static export.
// Actual playlist data is fetched client-side in PlaylistDetailClient via useParams().
import PlaylistDetailClient from "./PlaylistDetailClient";

export function generateStaticParams() {
    // Only pre-render the placeholder path for Electron static export.
    // For Vercel SSR, return empty so all paths render dynamically.
    return process.env.ELECTRON_BUILD === 'true' ? [{ id: '_' }] : [];
}

export default function PlaylistDetailPage() {
    return <PlaylistDetailClient />;
}
