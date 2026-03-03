// Server component — required for generateStaticParams with static export.
// Actual playlist data is fetched client-side in PlaylistDetailClient via useParams().
import PlaylistDetailClient from "./PlaylistDetailClient";

export function generateStaticParams() {
    return [{ id: '_' }];
}

export default function PlaylistDetailPage() {
    return <PlaylistDetailClient />;
}
