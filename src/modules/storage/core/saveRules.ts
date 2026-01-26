export const isSaveFile = (name: string): boolean => /\.sv$/i.test(name);

export const extractSaveName = (fileName: string): string | null => {
	if (!isSaveFile(fileName)) return null;
	return fileName;
};

export const sortSaveNames = (names: string[]): string[] => [...names].sort();
