import { useState } from 'react';
import '../css/RenderGallery.css';

import type { PortfolioImage } from '../types/PortfolioPiece';





export default function RenderGallery({
    renders,
    editable = false,
    onAdd,


}: {
    renders: PortfolioImage[];
    editable: boolean;
    onAdd: <K extends keyof PortfolioImage>(key: K, value: PortfolioImage[K]) => void;



}) {
    const [selectedRender, setSelectedRender] = useState<PortfolioImage | null>(null);
    const [hoveredId, setHoveredId] = useState<number | null>(null);


    // const handleAddRender = () => {
    //     const input = document.createElement('input');
    //     input.type = 'file';
    //     input.accept = 'image/*';
    //     input.onchange = (e) => {
    //         const file = (e.target as HTMLInputElement).files?.[0];
    //         if (file) {
    //             const url = URL.createObjectURL(file);
    //             const caption = prompt('Enter caption for this render:') || 'Untitled';
    //             onRenderAdd?.(selectedIndex, url, caption);
    //         }
    //     };
    //     input.click();
    // };

    

    return (
        <>
            <div className="render-gallery">
                {renders.map((render) => (
                    <div
                        key={render.id}
                        className="render-card"
                        onMouseEnter={() => setHoveredId(render.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => setSelectedRender(render)}
                    >
                        <div className="render-image-container">
                            <img src={render.url} alt={render.caption} className="render-image" />
                            <div className={`render-overlay ${hoveredId === render.id ? 'visible' : ''}`}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.35-4.35" />
                                    <line x1="11" y1="8" x2="11" y2="14" />
                                    <line x1="8" y1="11" x2="14" y2="11" />
                                </svg>
                            </div>
                            {editable && (
                                <button
                                    className="delete-render-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        console.log('Delete render', render.id);
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        <div className="render-caption">
                            <p>{render.caption}</p>
                        </div>
                    </div>
                ))}


                {editable && (
                    <button className="add-render-btn" onClick={() => onAdd("caption", "New Caption")}>
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            {/* Camera body */}
                            <rect x="3" y="7" width="18" height="12" rx="2" />

                            {/* Lens */}
                            <circle cx="12" cy="13" r="3" />

                            {/* Viewfinder bump */}
                            <path d="M8 7l1.5-2h5L16 7" />

                            {/* Add indicator */}
                            <line x1="18.5" y1="4.5" x2="18.5" y2="8" />
                            <line x1="16.75" y1="6.25" x2="20.25" y2="6.25" />
                        </svg>

                        Add Render
                    </button>

                )}


            </div>

            


            {selectedRender && (
                <div className="lightbox" onClick={() => setSelectedRender(null)}>
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="lightbox-close" onClick={() => setSelectedRender(null)}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                        <img src={selectedRender.url} alt={selectedRender.caption} />
                        <p className="lightbox-caption">{selectedRender.caption}</p>
                    </div>
                </div>
            )}
        </>
    );
}