"use client";

import { useState } from "react";
import { Playlist, PlaylistItem } from "@/services/api";
import { usePlayer } from "@/context/PlayerContext";
import { GripVertical, Trash2 } from "lucide-react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface PlaylistViewProps {
    playlist: Playlist;
    onItemsReorder: (items: PlaylistItem[]) => Promise<void>;
    onRemoveItem: (index: number) => Promise<void>;
}

interface SortableRowProps {
    item: PlaylistItem;
    index: number;
    isCurrentTrack: boolean;
    isPlaying: boolean;
    onPlay: () => void;
    onRemove: () => void;
}

function SortableRow({ item, index, isCurrentTrack, isPlaying, onPlay, onRemove }: SortableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `item-${index}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={onPlay}
            className={`group flex items-center gap-2 px-2 sm:px-4 py-3 rounded-lg cursor-pointer transition-all border border-transparent min-h-[56px] ${
                isCurrentTrack ? 'bg-primary/10 border-primary/20' : 'hover:bg-white/5 hover:border-white/5 active:bg-white/5'
            }`}
        >
            {/* Drag handle — always visible on mobile, hover-only on desktop */}
            <div
                {...attributes}
                {...listeners}
                onClick={e => e.stopPropagation()}
                className="text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center touch-none"
                aria-label="Drag to reorder"
            >
                <GripVertical size={15} />
            </div>

            {/* Position — hidden on very small screens */}
            <div className="hidden sm:flex w-6 text-center text-sm text-zinc-500 font-medium flex-shrink-0 items-center justify-center">
                {isCurrentTrack && isPlaying ? (
                    <div className="flex items-end gap-0.5 h-3 justify-center">
                        <span className="w-0.5 h-full bg-primary animate-[music-bar_0.5s_ease-in-out_infinite]" />
                        <span className="w-0.5 h-2/3 bg-primary animate-[music-bar_0.5s_ease-in-out_infinite_0.1s]" />
                        <span className="w-0.5 h-full bg-primary animate-[music-bar_0.5s_ease-in-out_infinite_0.2s]" />
                    </div>
                ) : (
                    <span className={isCurrentTrack ? 'text-primary' : ''}>{index + 1}</span>
                )}
            </div>

            {/* Cover art + track info */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                {item.coverArt ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={item.coverArt}
                        alt=""
                        className="w-9 h-9 rounded object-cover flex-shrink-0"
                        onError={e => (e.currentTarget.style.display = 'none')}
                    />
                ) : (
                    <div className="w-9 h-9 rounded bg-zinc-800 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${isCurrentTrack ? 'text-primary' : 'text-zinc-200'}`}>
                        {item.title}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{item.artist}</p>
                </div>
            </div>

            {/* Album — hidden on mobile */}
            <p className="text-sm text-zinc-500 truncate hidden lg:block w-32 xl:w-44 flex-shrink-0">{item.albumTitle}</p>

            {/* Duration */}
            <p className={`text-sm font-mono flex-shrink-0 ${isCurrentTrack ? 'text-white' : 'text-zinc-500'}`}>
                {item.duration || '--:--'}
            </p>

            {/* Remove — always visible on mobile, hover-only on desktop */}
            <button
                onClick={e => { e.stopPropagation(); onRemove(); }}
                className="flex-shrink-0 p-2 rounded-lg text-zinc-600 hover:text-red-400 active:text-red-400 hover:bg-red-400/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Remove from playlist"
                aria-label={`Remove ${item.title} from playlist`}
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
}

export default function PlaylistView({ playlist, onItemsReorder, onRemoveItem }: PlaylistViewProps) {
    const { playPlaylist, currentTrack, isPlaying } = usePlayer();
    const [localItems, setLocalItems] = useState<PlaylistItem[]>(playlist.items || []);

    const items = localItems;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = items.findIndex((_, i) => `item-${i}` === active.id);
        const newIndex = items.findIndex((_, i) => `item-${i}` === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(items, oldIndex, newIndex);
        setLocalItems(reordered);
        await onItemsReorder(reordered);
    };

    const handleRemove = async (index: number) => {
        const updated = [...items];
        updated.splice(index, 1);
        setLocalItems(updated);
        await onRemoveItem(index);
    };

    const isCurrentTrackFn = (item: PlaylistItem) => {
        return currentTrack?.audio_file === item.audioFile;
    };

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                <p className="text-lg font-medium mb-1">No tracks yet</p>
                <p className="text-sm">Add tracks from your library to get started.</p>
            </div>
        );
    }

    return (
        <div>
            {/* Table header */}
            <div className="flex items-center gap-2 px-2 sm:px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-white/5 mb-1">
                <div className="w-7 flex-shrink-0" aria-hidden="true" />
                <div className="hidden sm:block w-6 flex-shrink-0 text-center">#</div>
                <div className="flex-1">Title</div>
                <div className="hidden lg:block w-32 xl:w-44 flex-shrink-0">Album</div>
                <div className="flex-shrink-0">Time</div>
                <div className="w-9 flex-shrink-0" aria-hidden="true" />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                    items={items.map((_, i) => `item-${i}`)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-0.5">
                        {items.map((item, index) => (
                            <SortableRow
                                key={`item-${index}-${item.audioFile}`}
                                item={item}
                                index={index}
                                isCurrentTrack={isCurrentTrackFn(item)}
                                isPlaying={isCurrentTrackFn(item) && isPlaying}
                                onPlay={() => playPlaylist({ ...playlist, items }, index)}
                                onRemove={() => handleRemove(index)}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
