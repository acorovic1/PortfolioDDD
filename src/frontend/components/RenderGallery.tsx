import { useState } from 'react';
import '@/frontend/css/RenderGallery.css';

import type { PortfolioImage } from '@/types/PortfolioPiece';
import { ZoomIcon, CloseIcon, CameraIcon } from '@/frontend/svg/Icons';

export default function RenderGallery({
    renders,
    editable = false,
    onAdd,
    onDelete,
}: {
    renders: PortfolioImage[];
    editable: boolean;
    onAdd: () => void;
    onDelete: (renderId: string) => void;
}) {
    const [selectedRender, setSelectedRender] = useState<PortfolioImage | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

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
                                <ZoomIcon />
                            </div>
                            {editable && (
                                <button
                                    className="delete-render-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(render.id);
                                    }}
                                >
                                    <CloseIcon />
                                </button>
                            )}
                        </div>
                        <div className="render-caption">
                            <p>{render.caption}</p>
                        </div>
                    </div>
                ))}


                {editable && (
                    <button className="add-render-btn" onClick={onAdd}>
                        <CameraIcon />

                        Add Render
                    </button>

                )}


            </div>




            {selectedRender && (
                <div className="lightbox" onClick={() => setSelectedRender(null)}>
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="lightbox-close" onClick={() => setSelectedRender(null)}>
                            <CloseIcon width={24} height={24} />
                        </button>
                        <img src={selectedRender.url} alt={selectedRender.caption} />
                        <p className="lightbox-caption">{selectedRender.caption}</p>
                    </div>
                </div>
            )}
        </>
    );
}
