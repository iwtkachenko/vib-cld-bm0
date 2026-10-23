/** Mantine theme color names offered in color pickers. */
export const COLOR_NAMES = ['gray', 'red', 'pink', 'grape', 'violet', 'indigo', 'blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange'] as const
export type ColorName = (typeof COLOR_NAMES)[number]

export const STATUS_CATEGORY_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' } as const
export const STATUS_CATEGORY_COLOR = { todo: 'gray', in_progress: 'blue', done: 'green' } as const
