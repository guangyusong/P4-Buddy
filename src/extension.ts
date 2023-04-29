import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('p4-plantuml-generator.understandP4Code', () => {
			generateSystemDescription();
		})
	);
}

function generateDescriptionFromP4Code(p4Code: string): string {
	const controlRegex = /control\s+(\w+)\s*\(/;
	const tableRegex = /table\s+(\w+)\s*\{/;
	const actionRegex = /action\s+(\w+)\s*\(/;

	let controls: { [key: string]: { tables: string[]; actions: string[] } } = {};

	let lines = p4Code.split('\n');
	let currentControl = '';

	for (const line of lines) {
		let controlMatch = controlRegex.exec(line);
		let tableMatch = tableRegex.exec(line);
		let actionMatch = actionRegex.exec(line);

		if (controlMatch) {
			currentControl = controlMatch[1];
			controls[currentControl] = { tables: [], actions: [] };
		} else if (tableMatch && currentControl) {
			controls[currentControl].tables.push(tableMatch[1]);
		} else if (actionMatch && currentControl) {
			controls[currentControl].actions.push(actionMatch[1]);
		}
	}

	let description = "The system consists of the following components:\n";
	for (const control in controls) {
		description += `• Control: ${control}\n`;
		if (controls[control].tables.length > 0) {
			description += "  ◦ Tables:\n";
			for (const table of controls[control].tables) {
				description += `    ▪ ${table}\n`;
			}
		}
		if (controls[control].actions.length > 0) {
			description += "  ◦ Actions:\n";
			for (const action of controls[control].actions) {
				description += `    ▪ ${action}\n`;
			}
		}
	}

	return description;
}


async function generateSystemDescription() {
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

		const panel = vscode.window.createWebviewPanel(
			'plantUMLPreview',
			'System Description',
			vscode.ViewColumn.Beside,
			{}
		);

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

		vscode.window.showInformationMessage('System description generated successfully.');
	} catch (error: any) {
		vscode.window.showErrorMessage(`Error generating system description: ${error.message}`);
	}
}