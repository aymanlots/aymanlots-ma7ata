import React from 'react';

interface IllustrationProps {
  className?: string;
  opacity?: number;
}

export const CaravanSunset: React.FC<IllustrationProps> = ({
  className = '',
  opacity = 0.25,
}) => {
  return (
    <div className={`pointer-events-none select-none overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 1000 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        style={{ opacity }}
      >
        <defs>
          <linearGradient id="sunsetSky" x1="500" y1="0" x2="500" y2="400" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1E1B4B" />
            <stop offset="30%" stopColor="#431407" />
            <stop offset="65%" stopColor="#78350F" />
            <stop offset="90%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
          <radialGradient id="sunGlow" cx="720" cy="220" r="160" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#F59E0B" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#B45309" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sky */}
        <rect width="1000" height="400" fill="url(#sunsetSky)" />

        {/* Glowing Sun over dunes */}
        <circle cx="720" cy="220" r="130" fill="url(#sunGlow)" />
        <circle cx="720" cy="220" r="45" fill="#FEF3C7" opacity="0.9" />

        {/* Distant Dunes */}
        <path
          d="M 0 320 Q 200 240 450 280 T 800 260 Q 920 270 1000 300 L 1000 400 L 0 400 Z"
          fill="#451A03"
          opacity="0.85"
        />

        {/* Middle Dunes */}
        <path
          d="M 0 350 Q 260 270 550 310 Q 780 340 1000 300 L 1000 400 L 0 400 Z"
          fill="#291003"
        />

        {/* Foreground Sand Dune Ridge */}
        <path
          d="M 0 380 Q 320 310 650 350 Q 840 370 1000 340 L 1000 400 L 0 400 Z"
          fill="#131C2E"
        />

        {/* Camel Caravan Silhouette crossing from left to right along the middle ridge */}
        {/* Camel 1 (Leader with Guide) */}
        <g fill="#0B1220">
          {/* Guide person silhouette */}
          <path d="M 290 324 L 290 312 Q 290 309 293 309 Q 296 309 296 312 L 296 324 Z" />
          <circle cx="293" cy="306" r="3.5" />
          {/* Walking stick */}
          <line x1="287" y1="310" x2="285" y2="330" stroke="#0B1220" strokeWidth="1.5" />
          {/* Lead rope */}
          <path d="M 295 316 Q 312 322 324 314" stroke="#0B1220" strokeWidth="1" fill="none" />

          {/* Camel 1 */}
          {/* Body and Hump */}
          <path d="M 324 316 C 326 310 330 306 336 306 C 342 306 345 292 352 292 C 359 292 363 304 368 304 C 374 304 378 308 380 316 C 380 324 376 328 368 328 L 334 328 C 328 328 324 322 324 316 Z" />
          {/* Neck and Head */}
          <path d="M 325 315 C 321 310 318 300 316 295 C 315 293 311 292 312 288 C 313 286 318 286 320 289 C 322 293 324 302 329 308 Z" />
          {/* Legs */}
          <path d="M 330 327 L 328 344 M 338 327 L 340 345 M 366 327 L 364 345 M 374 327 L 378 343" stroke="#0B1220" strokeWidth="3" strokeLinecap="round" />
          {/* Cargo Pack on camel */}
          <rect x="344" y="297" width="16" height="12" rx="2" fill="#0B1220" opacity="0.9" />

          {/* Rope between Camel 1 and 2 */}
          <path d="M 380 316 Q 396 325 410 316" stroke="#0B1220" strokeWidth="1" fill="none" />

          {/* Camel 2 */}
          <path d="M 410 318 C 412 312 416 308 422 308 C 428 308 431 294 438 294 C 445 294 449 306 454 306 C 460 306 464 310 466 318 C 466 326 462 330 454 330 L 420 330 C 414 330 410 324 410 318 Z" />
          <path d="M 411 317 C 407 312 404 302 402 297 C 401 295 397 294 398 290 C 399 288 404 288 406 291 C 408 295 410 304 415 310 Z" />
          <path d="M 416 329 L 414 346 M 424 329 L 426 347 M 452 329 L 450 347 M 460 329 L 464 345" stroke="#0B1220" strokeWidth="3" strokeLinecap="round" />
          <rect x="430" y="299" width="16" height="12" rx="2" fill="#0B1220" opacity="0.9" />

          {/* Rope between Camel 2 and 3 */}
          <path d="M 466 318 Q 482 327 496 318" stroke="#0B1220" strokeWidth="1" fill="none" />

          {/* Camel 3 */}
          <path d="M 496 320 C 498 314 502 310 508 310 C 514 310 517 296 524 296 C 531 296 535 308 540 308 C 546 308 550 312 552 320 C 552 328 548 332 540 332 L 506 332 C 500 332 496 326 496 320 Z" />
          <path d="M 497 319 C 493 314 490 304 488 299 C 487 297 483 296 484 292 C 485 290 490 290 492 293 C 494 297 496 306 501 312 Z" />
          <path d="M 502 331 L 500 348 M 510 331 L 512 349 M 538 331 L 536 349 M 546 331 L 550 347" stroke="#0B1220" strokeWidth="3" strokeLinecap="round" />
          <rect x="516" y="301" width="16" height="12" rx="2" fill="#0B1220" opacity="0.9" />
        </g>

        {/* Flying desert falcon in sky */}
        <path d="M 640 160 Q 646 155 654 158 Q 662 155 668 160 Q 660 163 654 168 Q 648 163 640 160 Z" fill="#291003" />
        <path d="M 610 178 Q 614 174 620 176 Q 626 174 630 178 Q 624 180 620 184 Q 616 180 610 178 Z" fill="#291003" />
      </svg>
    </div>
  );
};
