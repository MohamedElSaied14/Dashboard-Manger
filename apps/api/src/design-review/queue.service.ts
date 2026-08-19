import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { DesignReference, DesignReferenceDocument, DesignReferenceStatus } from "./design-reference.schema";
import { AiReferenceService } from "./ai-reference.service";
import { Client, ClientDocument } from "../clients/client.schema";

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private isRedisConnected = false;

  constructor(
    @InjectModel(DesignReference.name)
    private readonly designReferences: Model<DesignReferenceDocument>,
    @InjectModel(Client.name)
    private readonly clients: Model<ClientDocument>,
    private readonly aiReferenceService: AiReferenceService,
    private readonly config: ConfigService
  ) {}

  async onModuleInit() {
    const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
    
    try {
        this.logger.log(`Checking Redis connection at: ${redisUrl}`);
        
        const client = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          lazyConnect: true,
          retryStrategy: () => null,
        });
        
        await client.connect();
        await client.ping();
        await client.quit();
        
        this.logger.log("Redis is online. Initializing BullMQ...");
        
        // We initialize Queue
        this.queue = new Queue("design-reference-analysis", {
          connection: { url: redisUrl },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 2_000 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        });

        // Initialize Worker
        this.worker = new Worker(
          "design-reference-analysis",
          async (job: any) => {
            const { clientId, referenceId } = job.data;
            await this.processAnalysisJob(clientId, referenceId);
          },
          { connection: { url: redisUrl }, concurrency: 2 }
        );

        this.worker.on("completed", (job: any) => {
          this.logger.log(`Job ${job.id} completed successfully`);
        });

        this.worker.on("failed", (job: any, err: Error) => {
          this.logger.error(`Job ${job?.id} failed: ${err.message}`);
        });

        this.isRedisConnected = true;
        this.logger.log("BullMQ and Redis initialized successfully!");
        await this.resumeInterruptedJobs();
      } catch (err: any) {
        this.logger.warn(`Redis connection failed (${err?.message ?? err}). Falling back to in-memory background processing.`);
        this.isRedisConnected = false;
        this.queue = null;
        this.worker = null;
        await this.resumeInterruptedJobs();
      }
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.worker?.close(),
      this.queue?.close(),
    ].filter(Boolean) as Promise<unknown>[]);
  }

  private async resumeInterruptedJobs() {
    const interrupted = await this.designReferences
      .find({ status: { $in: [DesignReferenceStatus.Analyzing, DesignReferenceStatus.Uploaded] } })
      .select("_id clientId")
      .lean();
    for (const reference of interrupted) {
      await this.addAnalysisJob(String(reference.clientId), String(reference._id));
    }
    if (interrupted.length) {
      this.logger.log(`Resumed ${interrupted.length} interrupted reference analysis jobs.`);
    }
  }

  async addAnalysisJob(clientId: string, referenceId: string): Promise<void> {
    // Update status to analyzing
    await this.designReferences.findByIdAndUpdate(referenceId, {
      status: DesignReferenceStatus.Analyzing,
    });

    if (this.isRedisConnected && this.queue) {
      try {
        await this.queue.add(
          "analyze",
          { clientId, referenceId },
          { jobId: `reference-${referenceId}` },
        );
        this.logger.log(`Queued analysis job for reference: ${referenceId} using Redis`);
        return;
      } catch (err: any) {
        this.logger.warn(`Failed to add job to BullMQ: ${err?.message}. Executing job in-memory.`);
      }
    }

    // Fallback: Asynchronous in-memory execution using setTimeout to prevent blocking the HTTP thread
    this.logger.log(`Running in-memory background analysis job for reference: ${referenceId}`);
    setTimeout(async () => {
      try {
        await this.processAnalysisJob(clientId, referenceId);
      } catch (err: any) {
        this.logger.error(`In-memory background analysis failed: ${err?.message ?? err}`);
        await this.designReferences.findByIdAndUpdate(referenceId, {
          status: DesignReferenceStatus.Failed,
          analysis: { error: err?.message ?? "Background analysis failed" },
        });
      }
    }, 500);
  }

  private async processAnalysisJob(clientId: string, referenceId: string) {
    this.logger.log(`Processing reference design analysis: ${referenceId}`);
    
    const reference = await this.designReferences.findById(referenceId);
    if (!reference) {
      this.logger.error(`Reference Design ${referenceId} not found`);
      return;
    }

    const client = await this.clients.findById(clientId);
    if (!client) {
      this.logger.error(`Client ${clientId} not found`);
      await this.designReferences.findByIdAndUpdate(referenceId, {
        status: DesignReferenceStatus.Failed,
      });
      return;
    }

    try {
      // Call AI Vision analyzer service
      const analysisResult = await this.aiReferenceService.analyzeReference({
        imageUrl: reference.imageUrl,
        userContext: reference.userContext,
        currentBrief: client.briefs,
        currentGuidelines: client.designGuidelines,
      });

      // Prepare suggestions structure
      const suggestions = {
        clientBrief: analysisResult.recommendedBriefChanges ?? [],
        brandGuidelines: analysisResult.recommendedGuidelineChanges ?? [],
        designInstructions: analysisResult.designInstructions ?? [],
        thingsToAvoid: analysisResult.thingsToAvoid ?? [],
      };

      // Update DesignReference status to ready_for_review
      reference.status = DesignReferenceStatus.ReadyForReview;
      reference.analysis = analysisResult;
      reference.suggestions = suggestions;
      reference.aiModel = this.aiReferenceService.isConfigured()
        ? (this.config.get<string>("OPENAI_DESIGN_REVIEW_MODEL") ?? "gpt-4o-mini")
        : "mock-model";
      reference.promptVersion = "1.1";
      await reference.save();

      this.logger.log(`Reference Design ${referenceId} successfully analyzed`);
    } catch (error: any) {
      this.logger.error(`Error during reference design analysis: ${error?.message ?? error}`);
      reference.analysis = { error: error?.message ?? "Unknown AI analysis error" };
      await reference.save();
      throw error;
    }
  }
}
