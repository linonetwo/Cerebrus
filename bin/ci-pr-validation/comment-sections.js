/**
 * Unified comment section management for Cerebrus
 * Ensures consistent ordering and formatting of validation sections
 */

const CEREBRUS_IDENTIFIER = "<!-- TiddlyWiki PR report -->";

// Section markers with ordering priority (lower number = higher priority, appears first)
const SECTIONS = {
	BUILD_SIZE: {
		priority: 1,
		start: "<!-- Build Size Section -->",
		end: "<!-- End Build Size Section -->",
	},
	PATH_VALIDATION: {
		priority: 2,
		start: "<!-- Path Validation Section -->",
		end: "<!-- End Path Validation Section -->",
	},
	CHANGE_NOTE: {
		priority: 3,
		start: "<!-- Change Note Section -->",
		end: "<!-- End Change Note Section -->",
	},
};

/**
 * Parse existing comment into sections
 */
function parseCommentSections(commentBody) {
	const sections = {};
	
	for (const [key, config] of Object.entries(SECTIONS)) {
		const regex = new RegExp(`${config.start}([\\s\\S]*?)${config.end}`);
		const match = commentBody.match(regex);
		if (match) {
			sections[key] = {
				content: match[1].trim(),
				...config,
			};
		}
	}
	
	return sections;
}

/**
 * Build comment from sections
 */
function buildComment(sections) {
	// Sort sections by priority
	const sortedSections = Object.entries(sections)
		.sort(([, a], [, b]) => a.priority - b.priority);
	
	const parts = [CEREBRUS_IDENTIFIER];
	
	sortedSections.forEach(([, section], index) => {
		parts.push('');
		parts.push(section.start);
		parts.push('');
		parts.push(section.content);
		parts.push('');
		parts.push(section.end);
		
		// Add separator after each section except the last
		if (index < sortedSections.length - 1) {
			parts.push('');
			parts.push('---');
		}
	});
	
	return parts.join('\n');
}

/**
 * Update or add a section to an existing comment
 */
function updateCommentSection(existingBody, sectionKey, newContent) {
	if (!SECTIONS[sectionKey]) {
		throw new Error(`Unknown section key: ${sectionKey}`);
	}
	
	// Parse existing sections
	const sections = parseCommentSections(existingBody);
	
	// Update or add the new section
	sections[sectionKey] = {
		content: newContent,
		...SECTIONS[sectionKey],
	};
	
	// Rebuild comment
	return buildComment(sections);
}

/**
 * Remove a section from an existing comment
 */
function removeCommentSection(existingBody, sectionKey) {
	if (!SECTIONS[sectionKey]) {
		throw new Error(`Unknown section key: ${sectionKey}`);
	}
	
	// Parse existing sections
	const sections = parseCommentSections(existingBody);
	
	// Remove the section
	delete sections[sectionKey];
	
	// If no sections left, return empty
	if (Object.keys(sections).length === 0) {
		return null;
	}
	
	// Rebuild comment
	return buildComment(sections);
}

/**
 * Create initial comment with a section
 */
function createCommentWithSection(sectionKey, content) {
	if (!SECTIONS[sectionKey]) {
		throw new Error(`Unknown section key: ${sectionKey}`);
	}
	
	const sections = {
		[sectionKey]: {
			content,
			...SECTIONS[sectionKey],
		},
	};
	
	return buildComment(sections);
}

export {
	CEREBRUS_IDENTIFIER,
	SECTIONS,
	updateCommentSection,
	removeCommentSection,
	createCommentWithSection,
};
