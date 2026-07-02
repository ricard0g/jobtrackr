export type TagCategory = "TECH_STACK" | "COMPANY_TYPE" | "MODALITY" | "OTHER";

export interface Tag {
	tagId: number;
	tagCategory: TagCategory;
	tagName: string;
	tagColor: string | null;
	global: boolean;
}

export interface TagWriteRequest {
	tagCategory: TagCategory;
	tagName: string;
	tagColor?: string | null;
}
