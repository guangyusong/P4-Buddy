import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	let panel: vscode.WebviewPanel | undefined;

	const updateSystemDescription = () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found.');
			return;
		}

		const document = editor.document;
		if (document.languageId !== 'p4') {
			vscode.window.showErrorMessage('Active document is not a P4 file.');
			return;
		}

		const p4Code = document.getText();

		try {
			const description = generateDescriptionFromP4Code(p4Code);

			if (!panel) {
				panel = vscode.window.createWebviewPanel(
					'plantUMLPreview',
					'System Description',
					vscode.ViewColumn.Beside,
					{}
				);
			}

			panel.webview.html = `
			<!DOCTYPE html>
			<html lang="en">
			  <head>
				<meta charset="UTF-8">
				<meta http-equiv="X-UA-Compatible" content="IE=edge">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>System Description</title>
				<style>
				  body {
					font-family: sans-serif;
				  }
				  ul {
					list-style: disc;
					padding-left: 20px;
				  }
				  li {
					white-space: pre-wrap;
				  }
				</style>
			  </head>
			  <body>
				<ul>
				  <li>${description}</li>
				</ul>
			  </body>
			</html>
		  `;

			vscode.window.showInformationMessage('System description updated successfully.');
		} catch (error: any) {
			vscode.window.showErrorMessage(`Error generating system description: ${error.message}`);
		}
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('p4-plantuml-generator.understandP4Code', () => {
			updateSystemDescription();
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			if (document.languageId === 'p4') {
				updateSystemDescription();
			}
		})
	);
}

function generateDescriptionFromP4Code(p4Code: string): string {
	const controlRegex = /control\s+(\w+)\s*\(/;
	const tableRegex = /table\s+(\w+)\s*\{/;
	const keyLineRegex = /\s*key\s*=\s*\{/;
	const actionsLineRegex = /\s*actions\s*=\s*\{/;
	const sizeRegex = /\s*size\s*=\s*(\d+)\s*;/;
	const defaultActionRegex = /\s*default_action\s*=\s*(\w+)\s*;/;

	let controls: { [key: string]: { tables: { [key: string]: { key: string[]; actions: string[]; size: string; default_action: string } } } } = {};

	let lines = p4Code.split('\n');
	let currentControl = '';
	let currentTable = '';
	let parsingKeys = false;
	let parsingActions = false;

	for (const line of lines) {
		let controlMatch = controlRegex.exec(line);
		let tableMatch = tableRegex.exec(line);
		let keyLineMatch = keyLineRegex.exec(line);
		let actionsLineMatch = actionsLineRegex.exec(line);
		let sizeMatch = sizeRegex.exec(line);
		let defaultActionMatch = defaultActionRegex.exec(line);

		if (controlMatch) {
			currentControl = controlMatch[1];
			controls[currentControl] = { tables: {} };
		} else if (tableMatch && currentControl) {
			currentTable = tableMatch[1];
			controls[currentControl].tables[currentTable] = { key: [], actions: [], size: '', default_action: '' };
		} else if (currentControl && currentTable) {
			if (keyLineMatch) {
				parsingKeys = true;
			} else if (actionsLineMatch) {
				parsingActions = true;
			} else if (parsingKeys) {
				if (line.trim() === '}') {
					parsingKeys = false;
				} else {
					controls[currentControl].tables[currentTable].key.push(line.trim());
				}
			} else if (parsingActions) {
				if (line.trim() === '}') {
					parsingActions = false;
				} else {
					controls[currentControl].tables[currentTable].actions.push(line.trim());
				}
			} else if (sizeMatch) {
				controls[currentControl].tables[currentTable].size = sizeMatch[1];
			} else if (defaultActionMatch) {
				controls[currentControl].tables[currentTable].default_action = defaultActionMatch[1];
			}
		}
	}

	let description = "<p>The system consists of the following components:</p>";
	for (const control in controls) {
		description += `<h3>Control: ${control}</h3>`;
		if (Object.keys(controls[control].tables).length > 0) {
			description += "<h4>Tables:</h4>";
			for (const table in controls[control].tables) {
				description += `<h5>${table}</h5>`;
				description += `<table border="1" cellspacing="0" cellpadding="4">`;
				description += `  <tr>`;
				description += `    <th>Property</th>`;
				description += `    <th>Value</th>`;
				description += `  </tr>`;
				description += `  <tr>`;
				description += `    <td>Key</td>`;
				description += `    <td>${controls[control].tables[table].key.join(', ')}</td>`;
				description += `  </tr>`;
				description += `  <tr>`;
				description += `    <td>Actions</td>`;
				description += `    <td>${controls[control].tables[table].actions.join(', ')}</td>`;
				description += `  </tr>`;
				description += `  <tr>`;
				description += `    <td>Size</td>`;
				description += `    <td>${controls[control].tables[table].size}</td>`;
				description += `  </tr>`;
				description += `  <tr>`;
				description += `    <td>Default Action</td>`;
				description += `    <td>${controls[control].tables[table].default_action}</td>`;
				description += `  </tr>`;
				description += `</table>`;
			}
		}
	}

	return description;
}