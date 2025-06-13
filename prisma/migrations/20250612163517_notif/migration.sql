-- CreateTable
CREATE TABLE "Norm" (
    "id" SERIAL NOT NULL,
    "compostId" INTEGER NOT NULL,
    "temperatureMax" DOUBLE PRECISION DEFAULT 70.0,
    "humidityMax" DOUBLE PRECISION DEFAULT 80.0,
    "odorLevelMax" TEXT DEFAULT 'Moyen',
    "compostMassMax" DOUBLE PRECISION DEFAULT 1000.0,
    "oxygenationMin" DOUBLE PRECISION DEFAULT 10.0,
    "woodChipsAddedMax" DOUBLE PRECISION DEFAULT 50.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Norm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Norm_compostId_key" ON "Norm"("compostId");

-- AddForeignKey
ALTER TABLE "Norm" ADD CONSTRAINT "Norm_compostId_fkey" FOREIGN KEY ("compostId") REFERENCES "Compost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
