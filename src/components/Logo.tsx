


export default function Logo() {
    return(

      
                    <svg
                        width="48"
                        height="48"
                        viewBox="0 0 100 100"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <defs>
                            <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#0f172a" />
                                <stop offset="100%" stopColor="#020617" />
                            </linearGradient>

                            <linearGradient id="blueDepth" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#7dd3fc" />
                                <stop offset="100%" stopColor="#1e3a8a" />
                            </linearGradient>

                            <linearGradient id="greenDepth" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#6ee7b7" />
                                <stop offset="100%" stopColor="#065f46" />
                            </linearGradient>

                            <linearGradient id="magentaDepth" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#f9a8d4" />
                                <stop offset="100%" stopColor="#701a75" />
                            </linearGradient>
                        </defs>

                        
                        <rect x="8" y="8" width="84" height="84" rx="18" fill="url(#bgGradient)" />

                        
                        <g transform="translate(50 50) scale(0.26)">
                            
                            <g
                                fill="none"
                                stroke="#000"
                                strokeWidth="12"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity="0.35"
                            >
                                <path
                                    d="M -40 -60 L -40 60
           C 20 60, 40 30, 40 0
           C 40 -30, 20 -60, -40 -60 Z"
                                    transform="rotate(0) translate(0 -25) translate(6 6)"
                                />
                                <path
                                    d="M -40 -60 L -40 60
           C 20 60, 40 30, 40 0
           C 40 -30, 20 -60, -40 -60 Z"
                                    transform="rotate(120) translate(0 -25) translate(6 6)"
                                />
                                <path
                                    d="M -40 -60 L -40 60
           C 20 60, 40 30, 40 0
           C 40 -30, 20 -60, -40 -60 Z"
                                    transform="rotate(240) translate(0 -25) translate(6 6)"
                                />
                            </g>

                            
                            <g
                                fill="none"
                                strokeWidth="10"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path
                                    stroke="url(#blueDepth)"
                                    d="M -40 -60 L -40 60
           C 20 60, 40 30, 40 0
           C 40 -30, 20 -60, -40 -60 Z"
                                    transform="rotate(0) translate(0 -25)"
                                />

                                <path
                                    stroke="url(#greenDepth)"
                                    d="M -40 -60 L -40 60
           C 20 60, 40 30, 40 0
           C 40 -30, 20 -60, -40 -60 Z"
                                    transform="rotate(120) translate(0 -25)"
                                />

                                <path
                                    stroke="url(#magentaDepth)"
                                    d="M -40 -60 L -40 60
           C 20 60, 40 30, 40 0
           C 40 -30, 20 -60, -40 -60 Z"
                                    transform="rotate(240) translate(0 -25)"
                                />
                            </g>
                        </g>
                    </svg>

           
    )
};