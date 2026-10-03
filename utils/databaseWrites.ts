/** Development writes require an explicit true; the string "false" must stay off. */
export const databaseWritesEnabled = (development: boolean, value = process.env.ENABLE_DB_WRITES_IN_DEV): boolean =>
  !development || value?.trim().toLowerCase() === 'true'

/** Keep ownership of the buffered writer until its points are acknowledged. */
export const writeAcknowledged = async <T>(create: () => { writePoint(point: T): void; close(): Promise<void> }, point: T, acknowledged?: () => void) => {
  const writer = create()
  writer.writePoint(point)
  await writer.close()
  acknowledged?.()
}
