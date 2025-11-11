import path from 'path';
import { fileURLToPath } from 'url';
import PRCommentUtils from './pr-comment-utils.js';
import rules from './rules.js';
import { CEREBRUS_IDENTIFIER, updateCommentSection, removeCommentSection, createCommentWithSection } from './comment-sections.js';

async function applyRules(context, octokit, dryRun) {
	const { prNumber, repo, baseRef, owner, repoName } = context;
	const utils = new PRCommentUtils(octokit);
	const changedFiles = await utils.getChangedFiles(owner, repoName, prNumber);

	if(dryRun) {
		console.log(`ℹ️ [dry-run] Base branch: ${baseRef}`);
		console.log(`ℹ️ [dry-run] Changed files:\n- ${changedFiles.join('\n- ')}`);
	}

	let messages = [];

	function processRule(rule, baseRef, changedFiles) {
		const matched = rule.condition(baseRef, changedFiles);
		if(dryRun) {
			console.log(`🔍 [dry-run] Processed rule: "${rule.name}" — matched: ${matched}`);
		}
		if(matched) {
			messages.push(`\n\n${rule.message}`);
			if(rule.stopProcessing) {
				return true;
			}
		}
		return false;
	};

	let abort = false;
	for(const rule of rules) {
		if(processRule(rule, baseRef, changedFiles)) {
			abort = true;
			break
		};
	}

	// Check if there's an existing Cerebrus comment
	const existing = await utils.getExistingComment(owner, repoName, prNumber, CEREBRUS_IDENTIFIER);

	if(messages.length && !abort) {
		const pathMessage = messages.join("\n").trim();
		
		if(dryRun) {
			console.log(`💬 [dry-run] Would post comment:\n${pathMessage}`);
		} else {
			if (existing) {
				// Update existing comment, replacing the path validation section
				const updatedBody = updateCommentSection(existing.body, 'PATH_VALIDATION', pathMessage);
				await utils.updateComment(owner, repoName, prNumber, existing.id, updatedBody);
			} else {
				// Create new comment with Cerebrus identifier
				const fullComment = createCommentWithSection('PATH_VALIDATION', pathMessage);
				await utils.postComment(owner, repoName, prNumber, fullComment);
			}
		}
	} else if (existing && !dryRun) {
		// Remove path validation section if no messages
		const updatedBody = removeCommentSection(existing.body, 'PATH_VALIDATION');
		if (updatedBody && updatedBody !== existing.body) {
			await utils.updateComment(owner, repoName, prNumber, existing.id, updatedBody);
		} else if (!updatedBody) {
			// No sections left, delete the comment
			await utils.deleteComment(owner, repoName, prNumber, existing.id);
		}
	}
}

export default applyRules;