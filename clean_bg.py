from PIL import Image, ImageFilter
import numpy as np

img = Image.open('public/assets/aistudio/image_d025cf3d.png')
w, h = img.size
arr = np.array(img).copy()

# Screen bounds in image_d025cf3d.png:
x1, x2 = 119, 783
y1, y2 = 169, 1514

# Crop the phone screen area
screen = arr[y1:y2, x1:x2].copy()
sh, sw, _ = screen.shape
print(f"Screen shape: {sw}x{sh}")

# Save cropped original screen for reference
Image.fromarray(screen).save('public/assets/screen_raw.png')

# In screen coordinates:
# Top portion y in [0, 480]: pure sky gradient behind the logo and cards
# Let's see: the sky background is a clean vertical gradient.
# Let's sample the background color along left edge (x=10..30) and right edge (x=sw-30..sw-10) for the top part:
sky_col_left = screen[0:480, 15]
sky_col_right = screen[0:480, sw - 15]
sky_bg = np.zeros((480, sw, 3), dtype=np.uint8)
for y in range(480):
    c1 = screen[y, 15].astype(float)
    c2 = screen[y, sw - 15].astype(float)
    for x in range(sw):
        t = x / float(sw)
        sky_bg[y, x] = (c1 * (1 - t) + c2 * t).astype(np.uint8)

# Now in the chart area and road area:
# The mountains start around y=480 to 580.
# The road is from y=580 to bottom.
# Let's check chart lines: chart lines have distinct high green (G > 180, R < 100) or bright yellow (R > 200, G > 180, B < 150) or white dots (R>220, G>220, B>220).
# In the road, road colors are warm earthy brownish-grey: R~110-150, G~100-140, B~90-130.

cleaned = screen.copy()
# Replace top UI (headers, cards) with the clean sky gradient:
cleaned[0:480, :] = sky_bg

# For the chart area (y=500..880):
# Detect glowing chart lines and text
for y in range(480, sh):
    for x in range(sw):
        r, g, b = cleaned[y, x][:3]
        is_green_line = (g > 140 and r < 120 and b < 160)
        is_yellow_line = (r > 190 and g > 160 and b < 130)
        is_white_dot = (r > 200 and g > 200 and b > 180)
        is_ui_text = (r > 180 and g > 180 and b > 180 and y > 800) # days text or bottom nav
        if is_green_line or is_yellow_line or is_white_dot:
            # interpolate from nearby road pixels vertically
            pass

Image.fromarray(cleaned).save('public/assets/screen_cleaned_test.png')
print("Saved test")
