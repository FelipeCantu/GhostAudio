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
            className={`group grid grid-cols-[auto_auto_1fr_1fr_auto_auto] gap-3 items-center px-4 py-3 rounded-lg cursor-pointer transition-all border border-transparent ${
                isCurrentTrack ? 'bg-primary/10 border-primary/20' : 'hover:bg-white/5 hover:border-white/5'
            }`}
        >
            {/* Drag handle */}
            <div
                {...attributes}
                {...listeners}
                onClick={e => e.stopPropagation()}
                className="text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <GripVertical size={16} />
            </div>

            {/* Position */}
            <div className="w-6 text-center text-sm text-zinc-500 font-medium">
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

            {/* Cover art */}
            <div className="flex items-center gap-3 min-w-0">
                {item.coverArt ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.coverArt} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                ) : (
                    <div className="w-8 h-8 rounded bg-zinc-800 flex-shrink-0" />
                )}
                <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${isCurrentTrack ? 'text-primary' : 'text-zinc-200'}`}>{item.title}</p>
                    <p className="text-xs text-zinc-500 truncate">{item.artist}</p>
                </div>
            </div>

            {/* Album */}
            <p className="text-sm text-zinc-500 truncate hidden md:block">{item.albumTitle}</p>

            {/* Duration */}
            <p className={`text-sm font-mono ${isCurrentTrack ? 'text-white' : 'text-zinc-500'}`}>{item.duration || '--:--'}</p>

            {/* Remove */}
            <button
                onClick={e => { e.stopPropagation(); onRemove(); }}
                className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                title="Remove from playlist"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
}

export default function PlaylistView({ playlist, onItemsReorder, onRemoveItem }: PlaylistViewProps) {
    const { playPlaylist, currentTrack, isPlaying } = usePlayer();
    const [localItems, setLocalItems] = useState<PlaylistItem[]>(playlist.items || []);

    // Keep local items in sync if parent playlist changes
    const items = localItems;

    const sensors = useSensors(
        useSensor(PointerSensor),
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

    const isCurrentTrack = (item: PlaylistItem) => {
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
            <div className="grid grid-cols-[auto_auto_1fr_1fr_auto_auto] gap-3 px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-white/5 mb-1">
                <div className="w-4" />
                <div className="w-6 text-center">#</div>
                <div>Title</div>
                <div className="hidden md:block">Album</div>
                <div>Time</div>
                <div className="w-8" />
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
                                isCurrentTrack={isCurrentTrack(item)}
                                isPlaying={isCurrentTrack(item) && isPlaying}
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
