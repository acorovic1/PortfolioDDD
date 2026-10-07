import { useState } from 'react';
import '@/frontend/css/CommentSection.css';
import { SendIcon, CloseIcon, FlagIcon } from '@/frontend/svg/Icons';
import { useAuth } from '@/frontend/hooks/useAuth';
import type { Comment } from '@/types/Comment';

type CommentSectionProps = {
    comments: Comment[];
    onAddComment: (text: string) => void;
    onDeleteComment?: (commentId: string) => void;
    onReportComment?: (comment: Comment) => void;
};

export default function CommentSection({ comments, onAddComment, onDeleteComment, onReportComment }: CommentSectionProps) {
    const { user } = useAuth();
    const [draft, setDraft] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;

        onAddComment(text);
        setDraft('');
    };

    return (
        <div className="comment-section">
            <h3 className="info-section-title">Comments ({comments.length})</h3>

            {user && (
                <form className="comment-form" onSubmit={handleSubmit}>
                    <textarea
                        className="comment-input"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Add a comment..."
                    />
                    <button type="submit" className="comment-submit-btn" disabled={!draft.trim()}>
                        <SendIcon />
                    </button>
                </form>
            )}

            <div className="comment-list">
                {comments.length === 0 ? (
                    <p className="comment-empty">No comments yet. Be the first to say something!</p>
                ) : (
                    comments.map((comment) => (
                        <div key={comment.id} className="comment-item">
                            <div className="comment-avatar">{comment.author.charAt(0).toUpperCase()}</div>
                            <div className="comment-body">
                                <div className="comment-meta">
                                    <span className="comment-author">{comment.author}</span>
                                    <span className="comment-time">{comment.postedAt}</span>
                                </div>
                                <p className="comment-text">{comment.text}</p>
                            </div>
                            {user && onReportComment && comment.author !== user.username && (
                                <button
                                    className="comment-delete-btn"
                                    title="Report comment"
                                    aria-label="Report comment"
                                    onClick={() => onReportComment(comment)}
                                >
                                    <FlagIcon width={14} height={14} />
                                </button>
                            )}
                            {user && onDeleteComment && (
                                <button
                                    className="comment-delete-btn"
                                    title="Delete comment"
                                    onClick={() => onDeleteComment(comment.id)}
                                >
                                    <CloseIcon width={14} height={14} />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
