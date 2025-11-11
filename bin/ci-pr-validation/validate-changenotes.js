import PRCommentUtils from './pr-comment-utils.js';
import { 
	checkNeedsChangeNote, 
	validateChangeNotesFromContent, 
	parseChangeNotesFromContent,
	parseTiddlerContent 
} from './changenote.js';
import { CEREBRUS_IDENTIFIER, updateCommentSection, createCommentWithSection } from './comment-sections.js';

// Fetch file content from GitHub API
async function fetchFileFromGitHub(octokit, owner, repo, path, ref) {
	try {
		const { data } = await octokit.repos.getContent({
			owner,
			repo,
			path,
			ref,
		});
		
		if (data.type !== 'file') {
			return null;
		}
		
		// Content is base64 encoded
		const content = Buffer.from(data.content, 'base64').toString('utf-8');
		return content;
	} catch (error) {
		console.error(`Error fetching ${path}:`, error.message);
		return null;
	}
}

export default async function validateChangeNotes(context, octokit, dryRun) {
	const { owner, repoName, prNumber } = context;
	
	console.log('📝 Validating change notes...');
	
	const utils = new PRCommentUtils(octokit);
	
	try {
		// Get all changed files in the PR
		const { data: files } = await octokit.pulls.listFiles({
			owner,
			repo: repoName,
			pull_number: prNumber,
			per_page: 100,
		});
		
		// Get PR details to get head SHA
		const { data: pr } = await octokit.pulls.get({
			owner,
			repo: repoName,
			pull_number: prNumber,
		});
		
		const headSha = pr.head.sha;
		
		const allFiles = files.map(f => f.filename);
		const releaseNotesFiles = allFiles.filter(f => 
			f.match(/editions\/.*\/tiddlers\/releasenotes\/.*\.tid$/)
		);
		
		console.log(`Found ${allFiles.length} changed files, ${releaseNotesFiles.length} in releasenotes/`);
		
		// Check if PR needs change notes
		const needsChangeNote = checkNeedsChangeNote(allFiles);
		const hasChangeNotes = releaseNotesFiles.length > 0;
		
		let commentBody = '';
		let validationPassed = true;
		
		if (hasChangeNotes) {
			// Fetch files from GitHub API
			const fileContents = {};
			for (const file of releaseNotesFiles) {
				const content = await fetchFileFromGitHub(octokit, owner, repoName, file, headSha);
				if (content) {
					fileContents[file] = content;
				}
			}
			
			// Fetch ReleasesInfo.multids
			const releasesInfoPath = 'editions/tw5.com/tiddlers/releasenotes/ReleasesInfo.multids';
			const releasesInfoContent = await fetchFileFromGitHub(octokit, owner, repoName, releasesInfoPath, headSha);
			
			if (!releasesInfoContent) {
				commentBody = generateMissingReleasesInfoComment();
				validationPassed = false;
			} else {
				// Validate change note format
				const validation = validateChangeNotesFromContent(fileContents, releasesInfoContent);
				
				if (validation.success) {
					if (needsChangeNote) {
						// Parse and display change notes
						const summaries = parseChangeNotesFromContent(fileContents);
						commentBody = generateSuccessComment(summaries);
					} else {
						// Doc only changes with releasenotes files
						commentBody = generateDocOnlyWithNotesComment();
					}
				} else {
					// Check if we found any actual notes
					const hasActualNotes = Object.values(fileContents).some(content => {
						const fields = parseTiddlerContent(content);
						return fields && (fields.tags?.includes('$:/tags/ChangeNote') || fields.tags?.includes('$:/tags/ImpactNote'));
					});
					
					if (!hasActualNotes && needsChangeNote) {
						commentBody = generateMissingNotesComment();
						validationPassed = false;
					} else if (!hasActualNotes) {
						commentBody = generateDocOnlyWithNotesComment();
					} else {
						// Validation failed
						commentBody = generateValidationFailedComment(validation.errors);
						validationPassed = false;
					}
				}
			}
		} else {
			// No release notes files
			if (needsChangeNote) {
				commentBody = generateMissingChangeNoteComment();
				validationPassed = false;
			} else {
				commentBody = generateDocOnlyComment();
			}
		}
		
		// Post or update comment to PR
		if (!dryRun) {
			// Check if there's an existing Cerebrus comment
			const existingComment = await utils.getExistingComment(owner, repoName, prNumber, CEREBRUS_IDENTIFIER);
			
			if (existingComment) {
				// Update existing comment, replacing the change note section
				const updatedBody = updateCommentSection(existingComment.body, 'CHANGE_NOTE', commentBody);
				await utils.updateComment(owner, repoName, prNumber, existingComment.id, updatedBody);
			} else {
				// Create new comment with Cerebrus identifier
				const fullComment = createCommentWithSection('CHANGE_NOTE', commentBody);
				await utils.postComment(owner, repoName, prNumber, fullComment);
			}
		} else {
			console.log('Dry run - would post/update comment:');
			console.log(commentBody);
		}
		
		if (!validationPassed) {
			throw new Error('Change note validation failed');
		}
		
		return { success: validationPassed };
		
	} catch (error) {
		console.error('❌ Change note validation error:', error.message);
		throw error;
	}
}

function generateSuccessComment(summaries) {
	return `## ✅ Change Note Status

All change notes are properly formatted and validated!

${summaries}

<details>
<summary>📖 Change Note Guidelines</summary>

Change notes help track and communicate changes effectively. See the [full documentation](https://tiddlywiki.com/prerelease/#Release%20Notes%20and%20Changes) for details.

</details>`;
}

function generateValidationFailedComment(errors) {
	let errorText = '';
	
	for (const { file, issues } of errors) {
		errorText += `### 📄 \`${file}\`\n\n`;
		for (const issue of issues) {
			errorText += `- ${issue}\n`;
		}
		errorText += "\n";
	}
	
	return `## ❌ Change Note Status

Change note validation failed. Please fix the following issues:

${errorText}

---

📚 **Documentation**: [Release Notes and Changes](https://tiddlywiki.com/prerelease/#Release%20Notes%20and%20Changes)`;
}

function generateMissingChangeNoteComment() {
	return `## ⚠️ Change Note Status

This PR appears to contain code changes but doesn't include a change note.

Please add a change note by creating a \`.tid\` file in \`editions/tw5.com/tiddlers/releasenotes/<version>/\`

📚 **Documentation**: [Release Notes and Changes](https://tiddlywiki.com/prerelease/#Release%20Notes%20and%20Changes)

💡 **Note**: If this is a documentation-only change, you can ignore this message.`;
}

function generateMissingNotesComment() {
	return `## ⚠️ Change Note Status

This PR appears to contain code changes and modified files in the \`releasenotes/\` directory, but no valid Change Notes or Impact Notes were found.

Please ensure you've added proper change notes with the required tags (\`$:/tags/ChangeNote\` or \`$:/tags/ImpactNote\`).

📚 **Documentation**: [Release Notes and Changes](https://tiddlywiki.com/prerelease/#Release%20Notes%20and%20Changes)

Note: If this is a documentation-only change or doesn't require a change note, you can ignore this message.`;
}

function generateDocOnlyComment() {
	return `## ✅ Change Note Status

This PR contains documentation or configuration changes that typically don't require a change note.`;
}

function generateDocOnlyWithNotesComment() {
	return `## ✅ Change Note Status

This PR contains documentation or configuration changes (including changes to release notes documentation) that typically don't require a change note.`;
}

function generateMissingReleasesInfoComment() {
	return `## ❌ Change Note Status

Cannot validate change notes: \`ReleasesInfo.multids\` file not found.

This file is required to validate change note fields. Please ensure it exists in \`editions/tw5.com/tiddlers/releasenotes/\`.`;
}
