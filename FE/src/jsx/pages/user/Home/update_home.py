#!/usr/bin/env python3
import re

# Read the file
with open('Home.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace imports
content = content.replace("import styled from 'styled-components';", "import { LandingHomeWrapper } from './LandingHomeWrapper';")
content = content.replace("import noiseBg from '../../../../assets/noise_bg.png';\n", "")

# Remove color constants
content = re.sub(r"// Landing page color constants\s*const landingBackground = '#16161C';\s*const landingLightTextColor = '#DDDDDD';\s*const colorWhite = '#ffffff';\s*", "", content)

# Update selectors
content = content.replace('.landing-home-wrapper .animate-on-scroll', '.animate-on-scroll')

# Update wrapper div
content = content.replace('<div className="landing-home-wrapper" style={{ backgroundImage: `url(${noiseBg})` }}>', '<LandingHomeWrapper>')

# Update closing tag - find the pattern and replace
content = re.sub(r'(\s*)</div>\s*<div id="google_translate_element"></div>\s*</div>', r'\1</div>\n\1<div id="google_translate_element"></div>\n\1</LandingHomeWrapper>', content)

# Update splitText to add split-done check
content = re.sub(
    r'(new SplitType\(el, \{[^}]+\}\);)\s*(} catch \(e\) \{)',
    r'if (!el.classList.contains(\'split-done\')) {\n        \1\n          el.classList.add(\'split-done\');\n        }\2',
    content
)

# Write back
with open('Home.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("File updated successfully!")
